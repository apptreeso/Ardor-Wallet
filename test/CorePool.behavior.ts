import { ethers, upgrades } from "hardhat";

import chai from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";

import {
  ILV_PER_SECOND,
  INIT_TIME,
  END_TIME,
  ONE_YEAR,
  ONE_MONTH,
  toWei,
  getToken,
  getPool,
  getV1Pool,
  getUsers0,
  getUsers1,
  getUsers2,
  getTotalV1WeightMocked,
} from "./utils";
import YieldTree from "./utils/yield-tree";
import { ILVPoolUpgrade, SushiLPPoolUpgrade, PoolFactoryUpgrade } from "../types";

const { MaxUint256, AddressZero } = ethers.constants;

chai.use(solidity);
chai.use(chaiSubset);

const { expect } = chai;

export function fillV1StakeId(usingPool: string): () => void {
  return function () {
    beforeEach(async function () {
      const v1Pool = getV1Pool(this.ilvPoolV1, this.lpPoolV1, usingPool);

      const users = getUsers2([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await v1Pool.setUsers(users);
    });
    it("should fill a v1 stake id", async function () {
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);
      const v1Pool = getV1Pool(this.ilvPoolV1, this.lpPoolV1, usingPool);
      const token = getToken(this.ilv, this.lp, usingPool);

      const v1StakeData = await v1Pool.getDeposit(this.signers.alice.address, 0);

      if (usingPool === "ILV") {
        await this.ilvPool.connect(this.signers.alice).executeMigration([], 0, 0, [0, 1]);
      } else {
        await this.lpPool.connect(this.signers.alice).migrateLockedStakes([0, 1]);
      }
      // unlocks v1 tokens
      await pool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await v1Pool.changeStakeValue(this.signers.alice.address, 0, 0);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).fillV1StakeId(0, 0);

      const v2StakeData = await pool.getStake(this.signers.alice.address, 0);
      const v2UserWeight = (await pool.users(this.signers.alice.address)).totalWeight;
      const globalWeight = await pool.globalWeight();

      expect(v1StakeData[0]).to.be.equal(v2StakeData.value);
      expect(v1StakeData[1]).to.be.equal(v2UserWeight);
      expect(v1StakeData[2]).to.be.equal(v2StakeData.lockedFrom);
      expect(v1StakeData[3]).to.be.equal(v2StakeData.lockedUntil);
      expect(v1StakeData[4]).to.be.equal(v2StakeData.isYield);
      expect(globalWeight).to.be.equal(v2UserWeight);
    });
    it("should fill a v1 stake id, generate yield, and unstake", async function () {
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);
      const v1Pool = getV1Pool(this.ilvPoolV1, this.lpPoolV1, usingPool);
      const token = getToken(this.ilv, this.lp, usingPool);

      const poolWeight = await pool.weight();
      const totalWeight = await this.factory.totalWeight();

      const v1StakeData = await v1Pool.getDeposit(this.signers.alice.address, 0);

      if (usingPool === "ILV") {
        await this.ilvPool.connect(this.signers.alice).executeMigration([], 0, 0, [0, 1]);
      } else {
        await this.lpPool.connect(this.signers.alice).migrateLockedStakes([0, 1]);
      }

      await pool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(1, ONE_MONTH);
      await v1Pool.changeStakeValue(this.signers.alice.address, 0, 0);
      await v1Pool.changeStakeWeight(this.signers.alice.address, 0, 0);
      await pool.connect(this.signers.alice).fillV1StakeId(0, 0);
      const { pendingYield: pendingYield0 } = await pool.pendingRewards(this.signers.alice.address);

      await pool.setNow256(INIT_TIME + ONE_YEAR + 101);
      const aliceTotalWeight = toWei(1000e6);
      const V2PoolGlobalWeight = await pool.globalWeight();
      const v1PoolGlobalWeight = await v1Pool.usersLockingWeight();
      const expectedPendingYieldTotal = ILV_PER_SECOND.mul(ONE_YEAR + 101)
        .mul(poolWeight)
        .mul(aliceTotalWeight)
        .mul(toWei(100))
        .div(totalWeight)
        .div(V2PoolGlobalWeight.add(v1PoolGlobalWeight))
        .div(toWei(100));
      const expectedPendingYieldSinceFill = ILV_PER_SECOND.mul(100)
        .mul(poolWeight)
        .mul(aliceTotalWeight)
        .mul(toWei(100))
        .div(totalWeight)
        .div(V2PoolGlobalWeight.add(v1PoolGlobalWeight))
        .div(toWei(100));
      const { pendingYield: pendingYield1 } = await pool.pendingRewards(this.signers.alice.address);

      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR / 2);
      const { pendingYield: pendingYieldStored1 } = await pool.users(this.signers.alice.address);

      const v2StakeData = await pool.getStake(this.signers.alice.address, 1);

      await pool.connect(this.signers.alice).unstakeLocked(1, v2StakeData.value);

      const { value: stakeValueAfterUnstake } = await pool.getStake(this.signers.alice.address, 1);

      expect(v1StakeData[0]).to.be.equal(v2StakeData.value);
      expect(v1StakeData[2]).to.be.equal(v2StakeData.lockedFrom);
      expect(v1StakeData[3]).to.be.equal(v2StakeData.lockedUntil);
      expect(v1StakeData[4]).to.be.equal(v2StakeData.isYield);
      expect(Number(ethers.utils.formatEther(expectedPendingYieldTotal))).to.be.closeTo(
        Number(ethers.utils.formatEther(pendingYield1)),
        0.001,
      );
      expect(Number(ethers.utils.formatEther(expectedPendingYieldTotal))).to.be.closeTo(
        Number(ethers.utils.formatEther(pendingYieldStored1)),
        0.001,
      );
      expect(Number(ethers.utils.formatEther(expectedPendingYieldSinceFill))).to.be.closeTo(
        Number(ethers.utils.formatEther(pendingYield1.sub(pendingYield0))),
        0.001,
      );
      expect(stakeValueAfterUnstake).to.be.equal(0);
    });
    it("should fill a v1 stake id, generate yield, unstake and generate yield again", async function () {
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);
      const v1Pool = getV1Pool(this.ilvPoolV1, this.lpPoolV1, usingPool);
      const token = getToken(this.ilv, this.lp, usingPool);

      const poolWeight = await pool.weight();
      const totalWeight = await this.factory.totalWeight();

      const v1StakeData = await v1Pool.getDeposit(this.signers.alice.address, 0);

      if (usingPool === "ILV") {
        await this.ilvPool.connect(this.signers.alice).executeMigration([], 0, 0, [0, 1]);
      } else {
        await this.lpPool.connect(this.signers.alice).migrateLockedStakes([0, 1]);
      }
      await pool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(1, ONE_MONTH);
      await v1Pool.changeStakeValue(this.signers.alice.address, 0, 0);
      await v1Pool.changeStakeWeight(this.signers.alice.address, 0, 0);
      await pool.connect(this.signers.alice).fillV1StakeId(0, 0);
      const { pendingYield: pendingYield0 } = await pool.pendingRewards(this.signers.alice.address);

      await pool.setNow256(INIT_TIME + ONE_YEAR + 101);
      const aliceTotalWeight = toWei(1000e6);
      const V2PoolGlobalWeight = await pool.globalWeight();
      const V1PoolGlobalWeight = await v1Pool.usersLockingWeight();
      const expectedPendingYieldTotal = ILV_PER_SECOND.mul(ONE_YEAR + 101)
        .mul(poolWeight)
        .mul(aliceTotalWeight)
        .mul(toWei(100))
        .div(totalWeight)
        .div(V2PoolGlobalWeight.add(V1PoolGlobalWeight))
        .div(toWei(100));
      const expectedPendingYieldSinceFill = ILV_PER_SECOND.mul(100)
        .mul(poolWeight)
        .mul(aliceTotalWeight)
        .mul(toWei(100))
        .div(totalWeight)
        .div(V2PoolGlobalWeight.add(V1PoolGlobalWeight))
        .div(toWei(100));
      const { pendingYield: pendingYield1 } = await pool.pendingRewards(this.signers.alice.address);

      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR / 2);
      const { pendingYield: pendingYieldStored1 } = await pool.users(this.signers.alice.address);

      const v2StakeData = await pool.getStake(this.signers.alice.address, 1);

      await pool.connect(this.signers.alice).unstakeLocked(1, v2StakeData.value.sub(toWei(100)));
      await v1Pool.changeStakeValue(this.signers.alice.address, 1, toWei(200));
      await v1Pool.changeStakeWeight(this.signers.alice.address, 1, toWei(400e6));

      await pool.setNow256(INIT_TIME + ONE_YEAR + 251);

      const newV2PoolGlobalWeight = await pool.globalWeight();
      const newV1PoolGlobalWeight = await v1Pool.usersLockingWeight();
      const expectedPendingYieldSinceUnstake = ILV_PER_SECOND.mul(150)
        .mul(poolWeight)
        .mul(toWei(750e6))
        .mul(toWei(100))
        .div(totalWeight)
        .div(newV2PoolGlobalWeight.add(newV1PoolGlobalWeight))
        .div(toWei(100));

      const { pendingYield: pendingYield2 } = await pool.pendingRewards(this.signers.alice.address);

      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);
      const { pendingYield: pendingYieldStored2 } = await pool.users(this.signers.alice.address);

      expect(v1StakeData[0]).to.be.equal(v2StakeData.value);
      expect(v1StakeData[2]).to.be.equal(v2StakeData.lockedFrom);
      expect(v1StakeData[3]).to.be.equal(v2StakeData.lockedUntil);
      expect(v1StakeData[4]).to.be.equal(v2StakeData.isYield);
      expect(Number(ethers.utils.formatEther(expectedPendingYieldTotal))).to.be.closeTo(
        Number(ethers.utils.formatEther(pendingYield1)),
        0.01,
      );
      expect(Number(ethers.utils.formatEther(expectedPendingYieldTotal))).to.be.closeTo(
        Number(ethers.utils.formatEther(pendingYieldStored1)),
        0.01,
      );
      expect(Number(ethers.utils.formatEther(expectedPendingYieldSinceFill))).to.be.closeTo(
        Number(ethers.utils.formatEther(pendingYield1.sub(pendingYield0))),
        0.01,
      );
      expect(Number(ethers.utils.formatEther(expectedPendingYieldSinceUnstake))).to.be.closeTo(
        Number(ethers.utils.formatEther(pendingYield2.sub(pendingYield1))),
        0.01,
      );
      expect(Number(ethers.utils.formatEther(expectedPendingYieldSinceUnstake))).to.be.closeTo(
        Number(ethers.utils.formatEther(pendingYieldStored2.sub(pendingYield1))),
        0.01,
      );
    });
  };
}

export function merkleTree(): () => void {
  return function () {
    beforeEach(async function () {
      const users = getUsers0([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPoolV1.setUsers(users);

      this.tree = new YieldTree([
        {
          account: this.signers.alice.address,
          weight: toWei(2000),
        },
        {
          account: this.signers.bob.address,
          weight: toWei(10000),
        },
        {
          account: this.signers.carol.address,
          weight: toWei(4000),
        },
      ]);
      await this.ilvPool.connect(this.signers.deployer).setMerkleRoot(this.tree.getHexRoot());
    });
    it("returns the expected merkle root", async function () {
      const expectedRoot = this.tree.getHexRoot();
      const root = await this.ilvPool.merkleRoot();

      expect(expectedRoot).to.be.equal(root);
    });
    it("should validate a merkle proof correctly", async function () {
      const proof = this.tree.getProof(0, this.signers.alice.address, toWei(2000));

      await this.ilvPool.connect(this.signers.alice).executeMigration(proof, 0, toWei(2000), [0, 2]);
    });
    it("should validate a merkle proof correctly without stakeIds", async function () {
      const proof = this.tree.getProof(0, this.signers.alice.address, toWei(2000));

      await this.ilvPool.connect(this.signers.alice).executeMigration(proof, 0, toWei(2000), []);
    });
    it("should fail claiming twice", async function () {
      const proof = this.tree.getProof(0, this.signers.alice.address, toWei(2000));

      await this.ilvPool.connect(this.signers.alice).executeMigration(proof, 0, toWei(2000), [0, 2]);
      await expect(this.ilvPool.connect(this.signers.alice).executeMigration(proof, 0, toWei(2000), [0, 2])).reverted;
    });
    it("should fail claiming twice without stakeIds array", async function () {
      const proof = this.tree.getProof(0, this.signers.alice.address, toWei(2000));

      await this.ilvPool.connect(this.signers.alice).executeMigration(proof, 0, toWei(2000), [0, 2]);
      await expect(this.ilvPool.connect(this.signers.alice).executeMigration(proof, 0, toWei(2000), [0, 2])).reverted;
    });
    it("should fail with empty proof", async function () {
      await expect(this.ilvPool.connect(this.signers.alice).executeMigration([], 0, toWei(2000), [0, 2])).reverted;
    });
    it("should fail with invalid index - alice", async function () {
      const proof = this.tree.getProof(0, this.signers.alice.address, toWei(2000));

      await expect(this.ilvPool.connect(this.signers.alice).executeMigration(proof, 1, toWei(2000), [0, 2])).reverted;
    });
    it("should fail with invalid index - bob", async function () {
      const proof = this.tree.getProof(1, this.signers.bob.address, toWei(10000));

      await expect(this.ilvPool.connect(this.signers.bob).executeMigration(proof, 2, toWei(10000), [])).reverted;
    });
    it("should fail with invalid msg.sender", async function () {
      const proof = this.tree.getProof(1, this.signers.bob.address, toWei(10000));

      await expect(this.ilvPool.connect(this.signers.carol).executeMigration(proof, 1, toWei(10000), [])).reverted;
    });
    it("should set hasMigratedYield correctly", async function () {
      const proof0 = this.tree.getProof(0, this.signers.alice.address, toWei(2000));
      const proof1 = this.tree.getProof(1, this.signers.bob.address, toWei(10000));

      await this.ilvPool.connect(this.signers.alice).executeMigration(proof0, 0, toWei(2000), [0, 2]);
      await this.ilvPool.connect(this.signers.bob).executeMigration(proof1, 1, toWei(10000), []);

      const hasAliceMigrated = await this.ilvPool.hasMigratedYield(0);
      const hasBobMigratedYield = await this.ilvPool.hasMigratedYield(1);
      const hasCarolMigrated = await this.ilvPool.hasMigratedYield(2);

      expect(hasAliceMigrated).to.be.true;
      expect(hasBobMigratedYield).to.be.true;
      expect(hasCarolMigrated).to.be.false;
    });
    it("should not migrate more yield than allowed weight", async function () {
      const proof = this.tree.getProof(2, this.signers.carol.address, toWei(4000));

      await expect(this.ilvPool.connect(this.signers.carol).executeMigration(proof, 0, toWei(4001), [])).reverted;
    });
  };
}

export function upgradePools(): () => void {
  return function () {
    it("should upgrade ilv pool", async function () {
      const prevPoolAddress = this.ilvPool.address;
      this.ilvPool = (await upgrades.upgradeProxy(this.ilvPool.address, this.ILVPoolUpgrade)) as ILVPoolUpgrade;
      const newPoolAddress = this.ilvPool.address;

      expect(await (this.ilvPool as ILVPoolUpgrade).newFunction(1, 2)).to.be.equal(3);
      expect(prevPoolAddress).to.be.equal(newPoolAddress);
    });
    it("should upgrade lp pool", async function () {
      const prevPoolAddress = this.lpPool.address;
      this.lpPool = (await upgrades.upgradeProxy(this.lpPool.address, this.SushiLPPoolUpgrade)) as SushiLPPoolUpgrade;
      const newPoolAddress = this.lpPool.address;

      expect(await (this.ilvPool as ILVPoolUpgrade).newFunction(1, 2)).to.be.equal(3);
      expect(prevPoolAddress).to.be.equal(newPoolAddress);
    });
    it("should upgrade factory", async function () {
      const prevPoolAddress = this.factory.address;
      this.factory = (await upgrades.upgradeProxy(this.factory.address, this.PoolFactoryUpgrade)) as PoolFactoryUpgrade;
      const newPoolAddress = this.factory.address;

      expect(await (this.factory as PoolFactoryUpgrade).newFunction(1, 2)).to.be.equal(3);
      expect(prevPoolAddress).to.be.equal(newPoolAddress);
    });
    it("should revert upgrading ilv pool from invalid admin", async function () {
      const implementationAddress = await upgrades.prepareUpgrade(this.ilvPool.address, this.ILVPoolUpgrade);
      await expect(this.ilvPool.connect(this.signers.alice).upgradeTo(implementationAddress)).reverted;
    });
    it("should revert upgrading lp pool from invalid admin", async function () {
      const implementationAddress = await upgrades.prepareUpgrade(this.lpPool.address, this.SushiLPPoolUpgrade);
      await expect(this.lpPool.connect(this.signers.alice).upgradeTo(implementationAddress)).reverted;
    });
  };
}

export function setEndTime(): () => void {
  return function () {
    it("should correctly update endTime", async function () {
      const previousEndTime = await this.factory.endTime();

      await this.factory.connect(this.signers.deployer).setEndTime(END_TIME - 1000);

      const newEndTime = await this.factory.endTime();

      expect(previousEndTime).to.be.equal(END_TIME);
      expect(newEndTime).to.be.equal(END_TIME - 1000);
    });
    it("should revert if invalid endTime", async function () {
      await expect(this.factory.connect(this.signers.deployer).setEndTime(INIT_TIME - 1)).reverted;
    });
    it("should revert if invalid caller", async function () {
      await expect(this.factory.connect(this.signers.alice).setEndTime(INIT_TIME - 1)).reverted;
    });
  };
}

export function getPoolData(usingPool: string): () => void {
  return function () {
    it("should get correct pool data", async function () {
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);
      const token = getToken(this.ilv, this.lp, usingPool);

      const poolWeight = await pool.weight();

      const poolData = await this.factory.getPoolData(token.address);

      expect(poolData.poolToken).to.be.equal(token.address);
      expect(poolData.poolAddress).to.be.equal(pool.address);
      expect(poolData.weight).to.be.equal(poolWeight);
      expect(poolData.isFlashPool).to.be.equal(false);
    });
    it("should revert if pool does not exist", async function () {
      await expect(this.factory.getPoolData(this.signers.alice.address)).reverted;
    });
  };
}

export function moveFundsFromWallet(usingPool: string): () => void {
  return function () {
    it("should migrate an user stake", async function () {
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);
      const token = getToken(this.ilv, this.lp, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(INIT_TIME + 100);
      await this.factory.setNow256(INIT_TIME + 100);

      await pool.connect(this.signers.alice).claimYieldRewards(false);

      await pool.setNow256(INIT_TIME + 200);
      await this.factory.setNow256(INIT_TIME + 200);

      const { pendingYield: pendingYield0, pendingRevDis: pendingRevDis0 } = await pool.pendingRewards(
        this.signers.alice.address,
      );

      const { totalWeight: totalWeight0 } = await pool.users(this.signers.alice.address);

      await pool.connect(this.signers.alice).moveFundsFromWallet(this.signers.bob.address);

      const {
        pendingYield: pendingYield1,
        pendingRevDis: pendingRevDis1,
        totalWeight: totalWeight1,
      } = await pool.users(this.signers.bob.address);

      const { pendingYield: aliceNewPendingYield, pendingRevDis: aliceNewPendingRevDis } = await pool.pendingRewards(
        this.signers.alice.address,
      );

      expect(pendingYield0).to.be.equal(pendingYield1);
      expect(pendingRevDis0).to.be.equal(pendingRevDis1);
      expect(totalWeight0).to.be.equal(totalWeight1);
      expect(Number(aliceNewPendingYield)).to.be.equal(0);
      expect(Number(aliceNewPendingRevDis)).to.be.equal(0);
    });
    it("should revert if _to = address(0)", async function () {
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);
      const token = getToken(this.ilv, this.lp, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(INIT_TIME + 100);
      await this.factory.setNow256(INIT_TIME + 100);

      await pool.connect(this.signers.alice).claimYieldRewards(false);

      await pool.setNow256(INIT_TIME + 200);
      await this.factory.setNow256(INIT_TIME + 200);

      await expect(pool.connect(this.signers.alice).moveFundsFromWallet(AddressZero)).reverted;
    });
    it("should revert if newUser totalWeight != 0", async function () {
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);
      const token = getToken(this.ilv, this.lp, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(INIT_TIME + 100);
      await this.factory.setNow256(INIT_TIME + 100);

      await pool.connect(this.signers.alice).claimYieldRewards(false);

      await pool.setNow256(INIT_TIME + 200);
      await this.factory.setNow256(INIT_TIME + 200);

      await token.connect(this.signers.bob).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.bob).stakePoolToken(toWei(100), ONE_YEAR);

      await expect(pool.connect(this.signers.alice).moveFundsFromWallet(this.signers.bob.address)).reverted;
    });

    it("should revert if newUser stakes.length != 0", async function () {
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);
      const token = getToken(this.ilv, this.lp, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await token.connect(this.signers.bob).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.bob).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(INIT_TIME + 100);
      await this.factory.setNow256(INIT_TIME + 100);
      await this.ilvPool.setNow256(INIT_TIME + 100);

      await pool.connect(this.signers.alice).claimYieldRewards(false);

      await pool.connect(this.signers.bob).claimYieldRewards(false);

      await pool.setNow256(INIT_TIME + 201 + ONE_YEAR);
      await this.factory.setNow256(INIT_TIME + 201 + ONE_YEAR);
      await this.ilvPool.setNow256(INIT_TIME + 201 + ONE_YEAR);

      await pool.connect(this.signers.bob).unstakeLocked(0, toWei(100));
      await this.ilvPool
        .connect(this.signers.bob)
        .unstakeLocked(
          usingPool === "ILV" ? 1 : 0,
          (
            await this.ilvPool.getStake(this.signers.bob.address, usingPool === "ILV" ? 1 : 0)
          ).value,
        );

      expect((await pool.users(this.signers.bob.address)).totalWeight).to.be.equal(0);
      await expect(pool.connect(this.signers.alice).moveFundsFromWallet(this.signers.bob.address)).reverted;
    });
    it("should revert if newUser subYieldRewards != 0", async function () {
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);
      const token = getToken(this.ilv, this.lp, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await token.connect(this.signers.bob).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.bob).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(INIT_TIME + 100);
      await this.factory.setNow256(INIT_TIME + 100);
      await this.ilvPool.setNow256(INIT_TIME + 100);

      await pool.connect(this.signers.alice).claimYieldRewards(false);

      await pool.connect(this.signers.bob).claimYieldRewards(false);

      await expect(pool.connect(this.signers.alice).moveFundsFromWallet(this.signers.bob.address)).reverted;
    });
    it("should revert if newUser v1IdsLength > 0", async function () {
      await this.ilv.connect(this.signers.carol).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.carol).stakePoolToken(toWei(100), ONE_YEAR);

      await this.ilvPool.setNow256(INIT_TIME + 100);
      await this.factory.setNow256(INIT_TIME + 100);

      await this.ilvPool.connect(this.signers.carol).claimYieldRewards(false);

      await this.ilvPool.setNow256(INIT_TIME + 200);
      await this.factory.setNow256(INIT_TIME + 200);

      const users = getUsers1([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPoolV1.setUsers(users);

      await this.ilvPool.connect(this.signers.alice).migrateLockedStakes([0, 2]);

      await expect(this.ilvPool.connect(this.signers.carol).moveFundsFromWallet(this.signers.alice.address)).reverted;
    });
  };
}

export function setWeight(usingPool: string): () => void {
  return function () {
    it("should change pool weight from 0 to x", async function () {
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await this.factory.connect(this.signers.deployer).changePoolWeight(pool.address, 1200);

      const newPoolWeight = await pool.weight();

      expect(newPoolWeight).to.be.equal(1200);
    });
    it("should change pool weight from x to 0", async function () {
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await this.factory.connect(this.signers.deployer).changePoolWeight(pool.address, 0);

      const newPoolWeight = await pool.weight();

      expect(newPoolWeight).to.be.equal(0);
    });
    it("should block unauthorized addresses to change weight through pool", async function () {
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await expect(pool.connect(this.signers.deployer).setWeight(1000)).reverted;
    });
    it("should block unauthorized addresses to change weight through factory", async function () {
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await expect(this.factory.connect(this.signers.alice).changePoolWeight(pool.address, 0)).reverted;
    });
    it("should revert minting yield from non pool caller", async function () {
      await expect(
        this.factory.connect(this.signers.deployer).mintYieldTo(this.signers.deployer.address, toWei(100000), false),
      ).reverted;
    });
  };
}

export function migrationTests(usingPool: string): () => void {
  return function () {
    beforeEach(async function () {
      const v1Pool = getV1Pool(this.ilvPoolV1, this.lpPoolV1, usingPool);

      const users = getUsers0([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await v1Pool.setUsers(users);
    });
    context("#migrateLockedStake", function () {
      it("should migrate locked stakes - alice", async function () {
        const pool = getPool(this.ilvPool, this.lpPool, usingPool);

        await pool.connect(this.signers.alice).migrateLockedStakes([0, 2]);

        const aliceV1StakePositions = await Promise.all([
          pool.getV1StakePosition(this.signers.alice.address, 0),
          pool.getV1StakePosition(this.signers.alice.address, 2),
        ]);
        const aliceV1StakeIds = await Promise.all([
          pool.getV1StakeId(this.signers.alice.address, aliceV1StakePositions[0]),
          pool.getV1StakeId(this.signers.alice.address, aliceV1StakePositions[1]),
        ]);

        expect(aliceV1StakeIds[0]).to.be.equal(0);
        expect(aliceV1StakeIds[1]).to.be.equal(2);
      });
      it("should revert if _stakeId doesn't exist", async function () {
        const pool = getPool(this.ilvPool, this.lpPool, usingPool);

        await pool.connect(this.signers.alice).migrateLockedStakes([0, 2]);

        await expect(pool.getV1StakePosition(this.signers.alice.address, 4)).reverted;
      });
      it("should migrate locked stakes - carol", async function () {
        const pool = getPool(this.ilvPool, this.lpPool, usingPool);

        await pool.connect(this.signers.carol).migrateLockedStakes([0, 2]);

        const carolV1StakePositions = await Promise.all([
          pool.getV1StakePosition(this.signers.carol.address, 0),
          pool.getV1StakePosition(this.signers.carol.address, 2),
        ]);
        const carolV1StakeIds = await Promise.all([
          pool.getV1StakeId(this.signers.carol.address, carolV1StakePositions[0]),
          pool.getV1StakeId(this.signers.carol.address, carolV1StakePositions[1]),
        ]);

        expect(carolV1StakeIds[0]).to.be.equal(0);
        expect(carolV1StakeIds[1]).to.be.equal(2);
      });
      it("should revert if migrating already migrated stake", async function () {
        const pool = getPool(this.ilvPool, this.lpPool, usingPool);

        await pool.connect(this.signers.carol).migrateLockedStakes([0, 2]);
        await expect(pool.connect(this.signers.carol).migrateLockedStakes([0, 2])).reverted;
      });
      it("should revert if migrating yield", async function () {
        const pool = getPool(this.ilvPool, this.lpPool, usingPool);

        await expect(pool.connect(this.signers.carol).migrateLockedStakes([1])).reverted;
        await expect(pool.connect(this.signers.alice).migrateLockedStakes([1])).reverted;
      });
      it("should revert if migrating unlocked stake", async function () {
        const pool = getPool(this.ilvPool, this.lpPool, usingPool);

        await expect(pool.connect(this.signers.bob).migrateLockedStakes([0])).reverted;
      });
      it("should revert if lockedFrom > v1StakeMaxPeriod", async function () {
        const pool = getPool(this.ilvPool, this.lpPool, usingPool);

        await expect(pool.connect(this.signers.bob).migrateLockedStakes([1])).reverted;
      });
    });
    it("should accumulate ILV correctly - with v1 stake ids", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);
      const v1Pool = getV1Pool(this.ilvPoolV1, this.lpPoolV1, usingPool);

      await pool.connect(this.signers.alice).migrateLockedStakes([0, 2]);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(INIT_TIME + 10);

      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      const totalWeight = await this.factory.totalWeight();
      const poolWeight = await pool.weight();
      const aliceStakeWeight = toWei(600).mul(2e6);
      const totalV1UsersWeight = await v1Pool.usersLockingWeight();
      const totalV2UsersWeight = (await pool.globalWeight()).sub(toWei(100).mul(2e6));

      const expectedRewards =
        10 *
        Number(ILV_PER_SECOND) *
        (poolWeight / totalWeight) *
        (Number(aliceStakeWeight) / Number(totalV1UsersWeight.add(totalV2UsersWeight)));

      const { pendingYield } = await pool.pendingRewards(this.signers.alice.address);

      expect(ethers.utils.formatEther(ethers.BigNumber.from(expectedRewards.toString())).slice(0, 5)).to.be.equal(
        ethers.utils.formatEther(pendingYield).slice(0, 5),
      );
    });
    it("should accumulate ILV correctly - with v1 stake ids and decreasing v1 weight", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);
      const v1Pool = getV1Pool(this.ilvPoolV1, this.lpPoolV1, usingPool);

      await pool.connect(this.signers.alice).migrateLockedStakes([0, 2]);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await token.connect(this.signers.bob).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);
      await pool.connect(this.signers.bob).stakePoolToken(toWei(600), ONE_YEAR);

      await pool.setNow256(INIT_TIME + 10);
      await this.factory.setNow256(INIT_TIME + 10);

      const totalWeight = await this.factory.totalWeight();
      const poolWeight = await pool.weight();
      const aliceStakeWeight = toWei(600).mul(2e6);
      const bobStakeWeight = toWei(600).mul(2e6);
      const totalV1UsersWeight = await v1Pool.usersLockingWeight();
      const totalV2UsersWeight = await pool.globalWeight();

      const expectedRewards0 =
        (10 *
          Number(ILV_PER_SECOND) *
          (poolWeight / totalWeight) *
          (Number(aliceStakeWeight.add(bobStakeWeight)) / Number(totalV1UsersWeight.add(totalV2UsersWeight)))) /
        2;

      const { pendingYield: alicePendingYield0 } = await pool.pendingRewards(this.signers.alice.address);
      const { pendingYield: bobPendingYield0 } = await pool.pendingRewards(this.signers.bob.address);

      await pool.connect(this.signers.alice).claimYieldRewards(true);
      await pool.connect(this.signers.bob).claimYieldRewards(true);

      const aliceSILVBalance0 = await this.silv.balanceOf(this.signers.alice.address);
      const bobSILVBalance0 = await this.silv.balanceOf(this.signers.bob.address);

      await v1Pool.changeStakeWeight(this.signers.alice.address, 2, 0);

      await pool.setNow256(INIT_TIME + 1010);
      await this.factory.setNow256(INIT_TIME + 1010);

      const newAliceStakeWeight = toWei(300).mul(2e6);
      const newBobStakeWeight = toWei(600).mul(2e6);
      const newTotalV1UsersWeight = await v1Pool.usersLockingWeight();
      const newTotalV2UsersWeight = await pool.globalWeight();
      const totalExpectedRewards1 =
        1000 *
        Number(ILV_PER_SECOND) *
        (poolWeight / totalWeight) *
        (Number(newAliceStakeWeight.add(newBobStakeWeight)) / Number(newTotalV1UsersWeight.add(newTotalV2UsersWeight)));

      const { pendingYield: alicePendingYield1 } = await pool.pendingRewards(this.signers.alice.address);
      const { pendingYield: bobPendingYield1 } = await pool.pendingRewards(this.signers.bob.address);

      await pool.connect(this.signers.alice).claimYieldRewards(true);
      await pool.connect(this.signers.bob).claimYieldRewards(true);

      const aliceSILVBalance1 = await this.silv.balanceOf(this.signers.alice.address);
      const bobSILVBalance1 = await this.silv.balanceOf(this.signers.bob.address);

      expect(
        Number(ethers.utils.formatEther(ethers.BigNumber.from(expectedRewards0.toString())).slice(0, 5)),
      ).to.be.closeTo(Number(ethers.utils.formatEther(alicePendingYield0).slice(0, 5)), 0.01);
      expect(
        Number(ethers.utils.formatEther(ethers.BigNumber.from(expectedRewards0.toString())).slice(0, 5)),
      ).to.be.closeTo(Number(ethers.utils.formatEther(bobPendingYield0).slice(0, 5)), 0.01);
      expect(Number(ethers.utils.formatEther(alicePendingYield1.add(bobPendingYield1)).slice(0, 5))).to.be.closeTo(
        Number(ethers.utils.formatEther(ethers.BigNumber.from(totalExpectedRewards1.toString())).slice(0, 5)),
        0.001,
      );
      expect(Number(ethers.utils.formatEther(bobPendingYield1).slice(0, 5))).to.be.closeTo(
        Number(ethers.utils.formatEther(alicePendingYield1.mul(2)).slice(0, 5)),
        0.001,
      );
      expect(aliceSILVBalance1.sub(aliceSILVBalance0)).to.be.equal(alicePendingYield1);
      expect(bobSILVBalance1.sub(bobSILVBalance0)).to.be.equal(bobPendingYield1);
    });
    it("should accumulate ILV correctly - with v1 stake ids and increasing v1 weight", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);
      const v1Pool = getV1Pool(this.ilvPoolV1, this.lpPoolV1, usingPool);

      await pool.connect(this.signers.alice).migrateLockedStakes([0, 2]);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await token.connect(this.signers.bob).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);
      await pool.connect(this.signers.bob).stakePoolToken(toWei(600), ONE_YEAR);

      await pool.setNow256(INIT_TIME + 10);
      await this.factory.setNow256(INIT_TIME + 10);

      const totalWeight = await this.factory.totalWeight();
      const poolWeight = await pool.weight();
      const aliceStakeWeight = toWei(600).mul(2e6);
      const bobStakeWeight = toWei(600).mul(2e6);
      const totalV1UsersWeight = await v1Pool.usersLockingWeight();
      const totalV2UsersWeight = await pool.globalWeight();

      const expectedRewards0 =
        (10 *
          Number(ILV_PER_SECOND) *
          (poolWeight / totalWeight) *
          (Number(aliceStakeWeight.add(bobStakeWeight)) / Number(totalV1UsersWeight.add(totalV2UsersWeight)))) /
        2;

      const { pendingYield: alicePendingYield0 } = await pool.pendingRewards(this.signers.alice.address);
      const { pendingYield: bobPendingYield0 } = await pool.pendingRewards(this.signers.bob.address);

      await pool.connect(this.signers.alice).claimYieldRewards(true);
      await pool.connect(this.signers.bob).claimYieldRewards(true);

      const aliceSILVBalance0 = await this.silv.balanceOf(this.signers.alice.address);
      const bobSILVBalance0 = await this.silv.balanceOf(this.signers.bob.address);

      await pool.setNow256(INIT_TIME + 1010);
      await this.factory.setNow256(INIT_TIME + 1010);

      await v1Pool.changeStakeWeight(this.signers.alice.address, 2, toWei(900).mul(2e6));

      const newAliceStakeWeight = toWei(600).mul(2e6);
      const newBobStakeWeight = toWei(600).mul(2e6);
      const newTotalV1UsersWeight = await v1Pool.usersLockingWeight();
      const newTotalV2UsersWeight = await pool.globalWeight();
      const totalExpectedRewards1 =
        1000 *
        Number(ILV_PER_SECOND) *
        (poolWeight / totalWeight) *
        (Number(newAliceStakeWeight.add(newBobStakeWeight)) / Number(newTotalV1UsersWeight.add(newTotalV2UsersWeight)));

      const { pendingYield: alicePendingYield1 } = await pool.pendingRewards(this.signers.alice.address);
      const { pendingYield: bobPendingYield1 } = await pool.pendingRewards(this.signers.bob.address);

      await pool.connect(this.signers.alice).claimYieldRewards(true);
      await pool.connect(this.signers.bob).claimYieldRewards(true);

      const aliceSILVBalance1 = await this.silv.balanceOf(this.signers.alice.address);
      const bobSILVBalance1 = await this.silv.balanceOf(this.signers.bob.address);

      expect(
        Number(ethers.utils.formatEther(ethers.BigNumber.from(expectedRewards0.toString())).slice(0, 5)),
      ).to.be.closeTo(Number(ethers.utils.formatEther(alicePendingYield0).slice(0, 5)), 0.01);
      expect(
        Number(ethers.utils.formatEther(ethers.BigNumber.from(expectedRewards0.toString())).slice(0, 5)),
      ).to.be.closeTo(Number(ethers.utils.formatEther(bobPendingYield0).slice(0, 5)), 0.01);
      expect(Number(ethers.utils.formatEther(alicePendingYield1.add(bobPendingYield1)).slice(0, 5))).to.be.closeTo(
        Number(ethers.utils.formatEther(ethers.BigNumber.from(totalExpectedRewards1.toString())).slice(0, 5)),
        0.001,
      );
      expect(Number(ethers.utils.formatEther(alicePendingYield1).slice(0, 5))).to.be.closeTo(
        Number(ethers.utils.formatEther(bobPendingYield1).slice(0, 5)),
        0.001,
      );
      expect(aliceSILVBalance1.sub(aliceSILVBalance0)).to.be.equal(alicePendingYield1);
      expect(bobSILVBalance1.sub(bobSILVBalance0)).to.be.equal(bobPendingYield1);
    });
  };
}

export function mintV1Yield(): () => void {
  return function () {
    beforeEach(async function () {
      const users = getUsers1([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPoolV1.setUsers(users);

      this.tree = new YieldTree([
        {
          account: this.signers.alice.address,
          weight: toWei(1000e6),
        },
        {
          account: this.signers.carol.address,
          weight: toWei(2000e6),
        },
      ]);
      await this.ilvPool.connect(this.signers.deployer).setMerkleRoot(this.tree.getHexRoot());

      await this.ilvPoolV1.setUsers(users);

      const aliceProof = this.tree.getProof(0, this.signers.alice.address, toWei(1000e6));
      const carolProof = this.tree.getProof(1, this.signers.carol.address, toWei(2000e6));

      await this.ilvPool.connect(this.signers.alice).executeMigration(aliceProof, 0, toWei(1000e6), []);
      await this.ilvPool.connect(this.signers.carol).executeMigration(carolProof, 1, toWei(2000e6), []);
    });

    it("should mint v1 yield", async function () {
      const ilvBalance0 = await this.ilv.balanceOf(this.signers.alice.address);

      await this.ilvPool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await this.ilvPool.connect(this.signers.alice).mintV1YieldMultiple([1]);

      const ilvBalance1 = await this.ilv.balanceOf(this.signers.alice.address);
      expect(ilvBalance1.sub(ilvBalance0)).to.be.equal(toWei(500));
    });
    it("should revert if stake !isYield", async function () {
      await this.ilvPool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await expect(this.ilvPool.connect(this.signers.alice).mintV1YieldMultiple([0])).reverted;
    });
    it("should revert if lockedUntil > _now256", async function () {
      await expect(this.ilvPool.connect(this.signers.alice).mintV1YieldMultiple([1])).reverted;
    });
    it("should revert if yield is already minted", async function () {
      await this.ilvPool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await this.ilvPool.connect(this.signers.alice).mintV1YieldMultiple([1]);
      await expect(this.ilvPool.connect(this.signers.alice).mintV1YieldMultiple([1])).reverted;
    });
    it("should mint multiple v1 yield stake", async function () {
      const users = getUsers1([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      const ilvBalance0 = await this.ilv.balanceOf(this.signers.carol.address);

      await this.ilvPool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await this.ilvPool.connect(this.signers.carol).mintV1YieldMultiple([0, 1, 2]);

      const ilvBalance1 = await this.ilv.balanceOf(this.signers.carol.address);

      expect(ilvBalance1.sub(ilvBalance0)).to.be.equal(
        users[2].deposits[0].tokenAmount.add(users[2].deposits[1].tokenAmount).add(users[2].deposits[2].tokenAmount),
      );
    });
    it("should revert minting multiple yield stakes if already minted", async function () {
      await this.ilvPool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await this.ilvPool.connect(this.signers.carol).mintV1YieldMultiple([0, 1, 2]);
      await expect(this.ilvPool.connect(this.signers.carol).mintV1YieldMultiple([0, 1, 2])).reverted;
    });
    it("should revert if passing !isYield _stakeId", async function () {
      await this.ilvPool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await expect(this.ilvPool.connect(this.signers.alice).mintV1YieldMultiple([0, 1, 2])).reverted;
    });
    it("should revert on mintYieldMultiple if yield is locked", async function () {
      await this.ilvPool.setNow256(INIT_TIME);
      await expect(this.ilvPool.connect(this.signers.alice).mintV1YieldMultiple([0, 1, 2])).reverted;
    });
  };
}

export function sync(usingPool: string): () => void {
  return function () {
    it("should sync pool state", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR / 10);

      await pool.setNow256(INIT_TIME + 10);
      await pool.sync();

      const poolWeight = await pool.weight();
      const totalWeight = await this.factory.totalWeight();

      const lastYieldDistribution = await pool.lastYieldDistribution();
      const yieldRewardsPerWeight = await pool.yieldRewardsPerWeight();

      const expectedLastYieldDistribution = ethers.BigNumber.from(INIT_TIME + 10);
      const expectedYieldRewardsPerWeight = ILV_PER_SECOND.mul(10)
        .mul(poolWeight)
        .mul(1e6)
        .div(totalWeight)
        .div(toWei(100))
        .mul(toWei(95))
        .div(toWei(100));

      expect(Number(ethers.utils.formatEther(expectedLastYieldDistribution))).to.be.closeTo(
        Number(ethers.utils.formatEther(lastYieldDistribution)),
        0.001,
      );
      expect(Number(ethers.utils.formatEther(expectedYieldRewardsPerWeight))).to.be.closeTo(
        Number(ethers.utils.formatEther(yieldRewardsPerWeight)),
        0.001,
      );
    });
    it("should sync pool state with totalStaked = 0", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);

      await pool.setNow256(INIT_TIME + 10);
      await pool.sync();

      const lastYieldDistribution = await pool.lastYieldDistribution();
      const yieldRewardsPerWeight = await pool.yieldRewardsPerWeight();

      const expectedLastYieldDistribution = ethers.BigNumber.from(INIT_TIME + 10);
      const expectedYieldRewardsPerWeight = 0;

      expect(expectedLastYieldDistribution).to.be.equal(lastYieldDistribution);
      expect(expectedYieldRewardsPerWeight).to.be.equal(yieldRewardsPerWeight);
    });
    it("should stop sync after endTime", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR / 10);

      await pool.setNow256(END_TIME + 100);
      await this.factory.setNow256(END_TIME + 100);
      await pool.sync();
      await pool.setNow256(END_TIME + 200);
      await this.factory.setNow256(END_TIME + 200);
      await pool.sync();

      const poolWeight = await pool.weight();
      const totalWeight = await this.factory.totalWeight();

      const lastYieldDistribution = await pool.lastYieldDistribution();
      const yieldRewardsPerWeight = await pool.yieldRewardsPerWeight();

      const expectedLastYieldDistribution = ethers.BigNumber.from(END_TIME);
      const globalWeight = await pool.globalWeight();
      const expectedYieldRewardsPerWeight = ILV_PER_SECOND.mul(END_TIME - INIT_TIME)
        .mul(poolWeight)
        .div(totalWeight)
        .mul(toWei(100))
        .div(globalWeight);

      expect(Number(ethers.utils.formatEther(expectedLastYieldDistribution))).to.be.closeTo(
        Number(ethers.utils.formatEther(lastYieldDistribution)),
        0.001,
      );
      expect(Number(ethers.utils.formatEther(expectedYieldRewardsPerWeight))).to.be.closeTo(
        Number(ethers.utils.formatEther(yieldRewardsPerWeight)),
        0.001,
      );
    });
    it("should update ilv per second after secondsPerUpdate", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_MONTH);

      await pool.setNow256(END_TIME - 100);
      await this.factory.setNow256(END_TIME - 100);

      const ilvPerSecond = await this.factory.ilvPerSecond();

      await pool.sync();

      const newIlvPerSecond = await this.factory.ilvPerSecond();
      const lastRatioUpdate = await this.factory.lastRatioUpdate();
      const expectedIlvPerSecond = ilvPerSecond.mul(97).div(100);
      const expectedLastRatioUpdate = END_TIME - 100;

      expect(expectedIlvPerSecond).to.be.equal(newIlvPerSecond);
      expect(expectedLastRatioUpdate).to.be.equal(lastRatioUpdate);
    });
  };
}

export function unstakeLockedMultiple(usingPool: string): () => void {
  return function () {
    it("should unstake multiple locked tokens", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);

      await pool.setNow256(ONE_YEAR + 1);

      const balance0 = await pool.balanceOf(this.signers.alice.address);

      const { value: value00 } = await pool.getStake(this.signers.alice.address, 0);
      const { value: value10 } = await pool.getStake(this.signers.alice.address, 1);
      const { value: value20 } = await pool.getStake(this.signers.alice.address, 2);
      const { value: value30 } = await pool.getStake(this.signers.alice.address, 3);

      const unstakeParameters = [
        { stakeId: 0, value: toWei(25) },
        { stakeId: 1, value: toWei(25) },
        { stakeId: 2, value: toWei(25) },
        { stakeId: 3, value: toWei(25) },
      ];

      await pool.connect(this.signers.alice).unstakeLockedMultiple(unstakeParameters, false);

      const balance1 = await pool.balanceOf(this.signers.alice.address);

      const { value: value01 } = await pool.getStake(this.signers.alice.address, 0);
      const { value: value11 } = await pool.getStake(this.signers.alice.address, 1);
      const { value: value21 } = await pool.getStake(this.signers.alice.address, 2);
      const { value: value31 } = await pool.getStake(this.signers.alice.address, 3);

      expect(balance0).to.be.equal(toWei(100));
      expect(balance1).to.be.equal(0);
      expect(value00).to.be.equal(toWei(25));
      expect(value10).to.be.equal(toWei(25));
      expect(value20).to.be.equal(toWei(25));
      expect(value30).to.be.equal(toWei(25));
      expect(value01).to.be.equal(0);
      expect(value11).to.be.equal(0);
      expect(value21).to.be.equal(0);
      expect(value31).to.be.equal(0);
    });
    it("should revert if unstake parameters length is 0", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);

      await pool.setNow256(ONE_YEAR + 1);

      await pool.getStake(this.signers.alice.address, 0);
      await pool.getStake(this.signers.alice.address, 1);
      await pool.getStake(this.signers.alice.address, 2);
      await pool.getStake(this.signers.alice.address, 3);

      const unstakeParameters: any[] = [];

      await expect(pool.connect(this.signers.alice).unstakeLockedMultiple(unstakeParameters, false)).reverted;
    });
    it("should revert if unstaking value is higher than stake value", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);

      await pool.setNow256(ONE_YEAR + 1);

      await pool.getStake(this.signers.alice.address, 0);
      await pool.getStake(this.signers.alice.address, 1);
      await pool.getStake(this.signers.alice.address, 2);
      await pool.getStake(this.signers.alice.address, 3);

      const unstakeParameters = [
        { stakeId: 0, value: toWei(25) },
        { stakeId: 1, value: toWei(26) },
        { stakeId: 2, value: toWei(25) },
        { stakeId: 3, value: toWei(25) },
      ];

      await expect(pool.connect(this.signers.alice).unstakeLockedMultiple(unstakeParameters, false)).reverted;
    });
    it("should unstake multiple locked tokens partially", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);

      await pool.setNow256(ONE_YEAR + 1);

      const balance0 = await pool.balanceOf(this.signers.alice.address);

      const { value: value00 } = await pool.getStake(this.signers.alice.address, 0);
      const { value: value10 } = await pool.getStake(this.signers.alice.address, 1);
      const { value: value20 } = await pool.getStake(this.signers.alice.address, 2);
      const { value: value30 } = await pool.getStake(this.signers.alice.address, 3);

      const unstakeParameters = [
        { stakeId: 0, value: toWei(25) },
        { stakeId: 1, value: toWei(15) },
        { stakeId: 2, value: toWei(20) },
        { stakeId: 3, value: toWei(22) },
      ];

      await pool.connect(this.signers.alice).unstakeLockedMultiple(unstakeParameters, false);

      const balance1 = await pool.balanceOf(this.signers.alice.address);

      const { value: value01 } = await pool.getStake(this.signers.alice.address, 0);
      const { value: value11 } = await pool.getStake(this.signers.alice.address, 1);
      const { value: value21 } = await pool.getStake(this.signers.alice.address, 2);
      const { value: value31 } = await pool.getStake(this.signers.alice.address, 3);

      expect(balance0).to.be.equal(toWei(100));
      expect(balance1).to.be.equal(toWei(18));
      expect(value00).to.be.equal(toWei(25));
      expect(value10).to.be.equal(toWei(25));
      expect(value20).to.be.equal(toWei(25));
      expect(value30).to.be.equal(toWei(25));
      expect(value01).to.be.equal(0);
      expect(value11).to.be.equal(toWei(10));
      expect(value21).to.be.equal(toWei(5));
      expect(value31).to.be.equal(toWei(3));
    });
    it("should unstake multiple locked yield after unlock", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);

      await this.ilvPool.setNow256(INIT_TIME + 100);

      await this.ilvPool.connect(this.signers.alice).claimYieldRewards(false);

      await this.ilvPool.setNow256(INIT_TIME + 200);

      await this.ilvPool.connect(this.signers.alice).claimYieldRewards(false);

      await this.ilvPool.setNow256(INIT_TIME + 300);

      await this.ilvPool.connect(this.signers.alice).claimYieldRewards(false);

      await this.ilvPool.setNow256(INIT_TIME + 400);

      await this.ilvPool.connect(this.signers.alice).claimYieldRewards(false);

      const { value: value00 } = await this.ilvPool.getStake(this.signers.alice.address, 1);
      const { value: value10 } = await this.ilvPool.getStake(this.signers.alice.address, 2);
      const { value: value20 } = await this.ilvPool.getStake(this.signers.alice.address, 3);
      const { value: value30 } = await this.ilvPool.getStake(this.signers.alice.address, 4);

      const unstakeParameters = [
        { stakeId: 1, value: value00 },
        { stakeId: 2, value: value10 },
        { stakeId: 3, value: value20 },
        { stakeId: 4, value: value30 },
      ];

      await this.ilvPool.setNow256(INIT_TIME + 401 + ONE_YEAR);
      await this.ilvPool.connect(this.signers.alice).unstakeLockedMultiple(unstakeParameters, true);

      const { value: value01 } = await this.ilvPool.getStake(this.signers.alice.address, 1);
      const { value: value11 } = await this.ilvPool.getStake(this.signers.alice.address, 2);
      const { value: value21 } = await this.ilvPool.getStake(this.signers.alice.address, 3);
      const { value: value31 } = await this.ilvPool.getStake(this.signers.alice.address, 4);

      expect(value01).to.be.equal(0);
      expect(value11).to.be.equal(0);
      expect(value21).to.be.equal(0);
      expect(value31).to.be.equal(0);
    });
    it("should revert unstaking multiple locked yield before unlock", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.alice).stakePoolToken(toWei(25), ONE_YEAR);

      await this.ilvPool.setNow256(INIT_TIME + 100);

      await this.ilvPool.connect(this.signers.alice).claimYieldRewards(false);

      await this.ilvPool.setNow256(INIT_TIME + 200);

      await this.ilvPool.connect(this.signers.alice).claimYieldRewards(false);

      await this.ilvPool.setNow256(INIT_TIME + 300);

      await this.ilvPool.connect(this.signers.alice).claimYieldRewards(false);

      await this.ilvPool.setNow256(INIT_TIME + 400);

      await this.ilvPool.connect(this.signers.alice).claimYieldRewards(false);

      const { value: value00 } = await this.ilvPool.getStake(this.signers.alice.address, usingPool === "ILV" ? 1 : 0);
      const { value: value10 } = await this.ilvPool.getStake(this.signers.alice.address, usingPool === "ILV" ? 2 : 1);
      const { value: value20 } = await this.ilvPool.getStake(this.signers.alice.address, usingPool === "ILV" ? 3 : 2);
      const { value: value30 } = await this.ilvPool.getStake(this.signers.alice.address, usingPool === "ILV" ? 4 : 3);

      const unstakeParameters = [
        { stakeId: usingPool === "ILV" ? 1 : 0, value: value00 },
        { stakeId: usingPool === "ILV" ? 2 : 1, value: value10 },
        { stakeId: usingPool === "ILV" ? 3 : 2, value: value20 },
        { stakeId: usingPool === "ILV" ? 4 : 3, value: value30 },
      ];

      await expect(this.ilvPool.connect(this.signers.alice).unstakeLockedMultiple(unstakeParameters, true)).reverted;
    });
  };
}

export function unstakeLocked(usingPool: string): () => void {
  return function () {
    it("should unstake locked tokens", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(ONE_YEAR + 1);

      const balance0 = await pool.balanceOf(this.signers.alice.address);
      const { value: value0 } = await pool.getStake(this.signers.alice.address, 0);
      const { totalWeight: totalWeight0 } = await pool.users(this.signers.alice.address);
      const globalWeight0 = await pool.globalWeight();

      await pool.connect(this.signers.alice).unstakeLocked(0, toWei(100));

      const balance1 = await pool.balanceOf(this.signers.alice.address);
      const { value: value1 } = await pool.getStake(this.signers.alice.address, 0);
      const { totalWeight: totalWeight1 } = await pool.users(this.signers.alice.address);
      const globalWeight1 = await pool.globalWeight();

      expect(balance0).to.be.equal(toWei(100));
      expect(value0).to.be.equal(toWei(100));
      expect(totalWeight0).to.be.equal(toWei(200e6));
      expect(totalWeight0).to.be.equal(globalWeight0);
      expect(balance1).to.be.equal(0);
      expect(value1).to.be.equal(0);
      expect(totalWeight1).to.be.equal(0);
      expect(totalWeight1).to.be.equal(globalWeight1);
    });
    it("should unstake locked tokens partially", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(ONE_YEAR + 1);

      const balance0 = await pool.balanceOf(this.signers.alice.address);
      const { value: value0 } = await pool.getStake(this.signers.alice.address, 0);

      await pool.connect(this.signers.alice).unstakeLocked(0, toWei(99));

      const balance1 = await pool.balanceOf(this.signers.alice.address);
      const { value: value1 } = await pool.getStake(this.signers.alice.address, 0);

      expect(balance0).to.be.equal(toWei(100));
      expect(value0).to.be.equal(toWei(100));
      expect(balance1).to.be.equal(toWei(1));
      expect(value1).to.be.equal(toWei(1));
    });
    it("should revert when _stakeId is invalid", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(ONE_YEAR + 1);

      await expect(pool.connect(this.signers.alice).unstakeLocked(1, toWei(100))).reverted;
    });
    it("should revert when _value is 0", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(ONE_YEAR + 1);

      await expect(pool.connect(this.signers.alice).unstakeLocked(0, 0)).reverted;
    });
    it("should revert when _value is higher than stake", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(ONE_YEAR + 1);

      await expect(pool.connect(this.signers.alice).unstakeLocked(0, toWei(101))).reverted;
    });
    it("should revert when tokens are still locked", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(ONE_YEAR);

      await expect(pool.connect(this.signers.alice).unstakeLocked(0, toWei(100))).reverted;
    });
  };
}

export function claimYieldRewardsMultiple(): () => void {
  return function () {
    it("should correctly claim multiple pools as ILV", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);
      await this.lpPool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await this.ilvPool.setNow256(INIT_TIME + 1000);
      await this.lpPool.setNow256(INIT_TIME + 1000);
      await this.factory.setNow256(INIT_TIME + 1000);

      const { pendingYield: ilvPoolPendingYield } = await this.ilvPool.pendingRewards(this.signers.alice.address);
      const { pendingYield: lpPoolPendingYield } = await this.lpPool.pendingRewards(this.signers.alice.address);

      await this.ilvPool
        .connect(this.signers.alice)
        .claimYieldRewardsMultiple([this.ilvPool.address, this.lpPool.address], [false, false]);

      const { value: ilvPoolYield } = await this.ilvPool.getStake(this.signers.alice.address, 1);
      const { value: lpPoolYield } = await this.ilvPool.getStake(this.signers.alice.address, 2);

      expect(ilvPoolYield).to.be.equal(ilvPoolPendingYield);
      expect(lpPoolYield).to.be.equal(lpPoolPendingYield);
    });
    it("should correctly claim multiple pools as sILV", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);
      await this.lpPool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await this.ilvPool.setNow256(INIT_TIME + 1000);
      await this.lpPool.setNow256(INIT_TIME + 1000);
      await this.factory.setNow256(INIT_TIME + 1000);

      const { pendingYield: ilvPoolPendingYield } = await this.ilvPool.pendingRewards(this.signers.alice.address);
      const { pendingYield: lpPoolPendingYield } = await this.lpPool.pendingRewards(this.signers.alice.address);

      await this.ilvPool
        .connect(this.signers.alice)
        .claimYieldRewardsMultiple([this.ilvPool.address, this.lpPool.address], [true, true]);

      const sILVBalance = await this.silv.balanceOf(this.signers.alice.address);
      const totalYield = ilvPoolPendingYield.add(lpPoolPendingYield);

      expect(sILVBalance).to.be.equal(totalYield);
    });
    it("should correctly claim multiple pools as ILV and sILV", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);
      await this.lpPool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await this.ilvPool.setNow256(INIT_TIME + 1000);
      await this.lpPool.setNow256(INIT_TIME + 1000);
      await this.factory.setNow256(INIT_TIME + 1000);

      const { pendingYield: ilvPoolPendingYield } = await this.ilvPool.pendingRewards(this.signers.alice.address);
      const { pendingYield: lpPoolPendingYield } = await this.lpPool.pendingRewards(this.signers.alice.address);

      await this.ilvPool
        .connect(this.signers.alice)
        .claimYieldRewardsMultiple([this.ilvPool.address, this.lpPool.address], [false, true]);

      const { value: compoundedIlvYield } = await this.ilvPool.getStake(this.signers.alice.address, 1);
      const sILVBalance = await this.silv.balanceOf(this.signers.alice.address);

      expect(compoundedIlvYield).to.be.equal(ilvPoolPendingYield);
      expect(sILVBalance).to.be.equal(lpPoolPendingYield);
    });
    it("should revert if claiming invalid pool", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);
      await this.lpPool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await this.ilvPool.setNow256(INIT_TIME + 1000);
      await this.lpPool.setNow256(INIT_TIME + 1000);
      await this.factory.setNow256(INIT_TIME + 1000);

      await expect(
        this.ilvPool
          .connect(this.signers.alice)
          .claimYieldRewardsMultiple([this.ilvPool.address, this.signers.bob.address], [false, true]),
      ).reverted;
    });
    it("should revert if claiming from invalid address", async function () {
      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);
      await this.lpPool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);
      await this.lpPool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await this.lpPool.setNow256(INIT_TIME + 1000);
      await this.lpPool.setNow256(INIT_TIME + 1000);
      await this.factory.setNow256(INIT_TIME + 1000);

      await expect(
        this.lpPool.connect(this.signers.alice).claimYieldRewardsFromRouter(this.signers.alice.address, false),
      ).reverted;
    });
  };
}

export function claimYieldRewards(usingPool: string): () => void {
  return function () {
    it("should create ILV stake correctly", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      const poolWeight = await pool.weight();
      const totalWeight = await this.factory.totalWeight();

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(INIT_TIME + 100);
      await this.factory.setNow256(INIT_TIME + 100);

      await pool.connect(this.signers.alice).claimYieldRewards(false);

      const expectedCompoundedYield = ILV_PER_SECOND.mul(100).mul(poolWeight).div(totalWeight);

      let yieldStake;

      if (usingPool === "ILV") {
        yieldStake = await this.ilvPool.getStake(this.signers.alice.address, 1);
      } else {
        yieldStake = await this.ilvPool.getStake(this.signers.alice.address, 0);
      }

      expect(expectedCompoundedYield).to.be.equal(yieldStake.value);
    });
    it("should mint ILV correctly", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      const poolWeight = await pool.weight();
      const totalWeight = await this.factory.totalWeight();

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(INIT_TIME + 100);
      await this.ilvPool.setNow256(INIT_TIME + 100);
      await this.factory.setNow256(INIT_TIME + 100);

      await pool.connect(this.signers.alice).claimYieldRewards(false);

      await pool.setNow256(INIT_TIME + 101 + ONE_YEAR);

      const expectedMintedYield = ILV_PER_SECOND.mul(100).mul(poolWeight).div(totalWeight);
      const balanceBeforeMint = await this.ilv.balanceOf(this.signers.alice.address);

      if (usingPool === "ILV") {
        await pool.connect(this.signers.alice).unstakeLocked(2, expectedMintedYield);
      } else {
        await this.ilvPool.setNow256(INIT_TIME + 101 + ONE_YEAR);
        await this.ilvPool.connect(this.signers.alice).unstakeLocked(1, expectedMintedYield);
      }

      const balanceAfterMint = await this.ilv.balanceOf(this.signers.alice.address);

      expect(balanceAfterMint.sub(balanceBeforeMint)).to.be.equal(expectedMintedYield);
    });
    it("should mint sILV correctly", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      const poolWeight = await pool.weight();
      const totalWeight = await this.factory.totalWeight();

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(INIT_TIME + 100);
      await this.factory.setNow256(INIT_TIME + 100);

      await pool.connect(this.signers.alice).claimYieldRewards(true);

      const expectedMintedYield = ILV_PER_SECOND.mul(100).mul(poolWeight).div(totalWeight);

      const sILVBalance = await this.silv.balanceOf(this.signers.alice.address);

      expect(sILVBalance).to.be.equal(expectedMintedYield);
    });
  };
}

export function pendingYield(usingPool: string): () => void {
  return function () {
    it("should not accumulate rewards before init time", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(1);
      await this.factory.setNow256(1);

      const { pendingYield } = await pool.pendingRewards(this.signers.alice.address);

      expect(pendingYield.toNumber()).to.be.equal(0);
    });
    it("should accumulate ILV correctly", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(INIT_TIME + 10);
      await this.factory.setNow256(INIT_TIME + 10);

      const totalWeight = await this.factory.totalWeight();
      const poolWeight = await pool.weight();

      const expectedRewards = 10 * Number(ILV_PER_SECOND) * (poolWeight / totalWeight);

      const { pendingYield } = await pool.pendingRewards(this.signers.alice.address);

      expect(expectedRewards).to.be.equal(Number(pendingYield));
    });
    it("should accumulate ILV correctly for multiple stakers", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR);

      await token.connect(this.signers.bob).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.bob).stakePoolToken(toWei(100), ONE_YEAR);

      await pool.setNow256(INIT_TIME + 10);
      await this.factory.setNow256(INIT_TIME + 10);

      const totalWeight = await this.factory.totalWeight();
      const poolWeight = await pool.weight();

      const expectedRewards = 10 * Number(ILV_PER_SECOND) * (poolWeight / totalWeight);

      const { pendingYield: aliceYield } = await pool.pendingRewards(this.signers.alice.address);
      const { pendingYield: bobYield } = await pool.pendingRewards(this.signers.bob.address);

      expect(Number(aliceYield)).to.be.equal(expectedRewards / 2);
      expect(Number(bobYield)).to.be.equal(expectedRewards / 2);
    });
    it("should calculate pending rewards correctly after bigger stakes", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      const poolWeight = await pool.weight();
      const totalWeight = await this.factory.totalWeight();

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(10), ONE_MONTH);

      await pool.setNow256(INIT_TIME + 50);
      await this.factory.setNow256(INIT_TIME + 50);

      const { pendingYield: aliceYield0 } = await pool.pendingRewards(this.signers.alice.address);

      const expectedAliceYield0 = ILV_PER_SECOND.mul(50).mul(poolWeight).div(totalWeight);

      await token.connect(this.signers.bob).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.bob).stakePoolToken(toWei(5000), ONE_YEAR);

      const totalInPool = toWei(10 * 1.1e6).add(toWei(5000 * 2e6));

      const { pendingYield: bobYield0 } = await pool.pendingRewards(this.signers.bob.address);

      const expectedBobYield0 = 0;

      await pool.setNow256(INIT_TIME + 200);
      await this.factory.setNow256(INIT_TIME + 200);

      const { pendingYield: aliceYield1 } = await pool.pendingRewards(this.signers.alice.address);
      const { pendingYield: bobYield1 } = await pool.pendingRewards(this.signers.bob.address);

      const expectedAliceYield1 = Number(
        ethers.utils.formatEther(
          ILV_PER_SECOND.mul(150)
            .mul(toWei(10 * 1.1e6))
            .div(totalInPool)
            .mul(poolWeight)
            .div(totalWeight)
            .add(expectedAliceYield0),
        ),
      ).toFixed(3);

      const expectedBobYield1 = Number(
        ethers.utils.formatEther(
          ILV_PER_SECOND.mul(150)
            .mul(toWei(5000 * 2e6))
            .div(totalInPool)
            .mul(poolWeight)
            .div(totalWeight),
        ),
      ).toFixed(3);

      expect(Number(ethers.utils.formatEther(expectedAliceYield0))).to.be.closeTo(
        Number(ethers.utils.formatEther(aliceYield0)),
        0.01,
      );
      expect(Number(expectedAliceYield1)).to.be.closeTo(Number(ethers.utils.formatEther(aliceYield1)), 0.01);
      expect(expectedBobYield0).to.be.equal(bobYield0);
      expect(Number(expectedBobYield1)).to.be.closeTo(Number(ethers.utils.formatEther(bobYield1)), 0.01);
    });
    it("should not accumulate yield after endTime", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      const poolWeight = await pool.weight();
      const totalWeight = await this.factory.totalWeight();

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_MONTH);

      await pool.setNow256(INIT_TIME + 20);
      await this.factory.setNow256(INIT_TIME + 20);

      const expectedYield0 = ILV_PER_SECOND.mul(20).mul(poolWeight).div(totalWeight);

      const { pendingYield: aliceYield0 } = await pool.pendingRewards(this.signers.alice.address);

      await pool.sync();

      await pool.setNow256(END_TIME);

      await pool.sync();

      const expectedYield1 = ILV_PER_SECOND.mul(END_TIME - INIT_TIME)
        .mul(poolWeight)
        .div(totalWeight);

      const { pendingYield: aliceYield1 } = await pool.pendingRewards(this.signers.alice.address);

      await pool.setNow256(END_TIME + 100);

      const { pendingYield: aliceYield2 } = await pool.pendingRewards(this.signers.alice.address);

      expect(Number(ethers.utils.formatEther(expectedYield0))).to.be.closeTo(
        Number(ethers.utils.formatEther(aliceYield0)),
        0.001,
      );
      expect(Number(ethers.utils.formatEther(expectedYield1))).to.be.closeTo(
        Number(ethers.utils.formatEther(aliceYield1)),
        0.001,
      );
      expect(Number(ethers.utils.formatEther(expectedYield1))).to.be.closeTo(
        Number(ethers.utils.formatEther(aliceYield2)),
        0.001,
      );
    });
  };
}

export function stake(usingPool: string): () => void {
  return function () {
    it("should stake and lock", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(50), ONE_YEAR);

      await pool.connect(this.signers.alice).stakePoolToken(toWei(50), ONE_YEAR);

      const balance = await pool.balanceOf(this.signers.alice.address);
      const { totalWeight } = await pool.users(this.signers.alice.address);
      const globalWeight = await pool.globalWeight();

      expect(balance).to.be.equal(toWei(100));
      expect(totalWeight).to.be.equal(toWei(200e6));
      expect(totalWeight).to.be.equal(globalWeight);
    });
    it("should get correct stakesLength", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakePoolToken(toWei(50), ONE_YEAR);

      await pool.connect(this.signers.alice).stakePoolToken(toWei(50), ONE_YEAR);

      const balance = await pool.balanceOf(this.signers.alice.address);
      const stakesLength = await pool.getStakesLength(this.signers.alice.address);

      expect(balance).to.be.equal(toWei(100));
      expect(stakesLength).to.be.equal(2);
    });
    it("should revert when staking longer than 2 years", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await expect(pool.connect(this.signers.alice).stakePoolToken(toWei(100), ONE_YEAR + 1)).reverted;
    });
    it("should revert when _lockDuration = 0", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await expect(pool.connect(this.signers.alice).stakePoolToken(toWei(100), 0)).reverted;
    });
    it("should revert when _value = 0", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await expect(pool.connect(this.signers.alice).stakePoolToken(toWei(0), ONE_YEAR)).reverted;
    });
  };
}
