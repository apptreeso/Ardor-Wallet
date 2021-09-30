import { ethers } from "hardhat";

import chai from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";

import {
  ILV_PER_SECOND,
  SECONDS_PER_UPDATE,
  INIT_TIME,
  END_TIME,
  ILV_POOL_WEIGHT,
  LP_POOL_WEIGHT,
  V1_STAKE_MAX_PERIOD,
  ONE_YEAR,
  toWei,
  toAddress,
  getToken,
  getPool,
  getV1Pool,
  getUsers0,
  getUsers1,
} from "./utils";

const { MaxUint256 } = ethers.constants;

chai.use(solidity);
chai.use(chaiSubset);

const { expect } = chai;

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

        await pool.connect(this.signers.alice).migrateLockedStake([0, 2]);

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
      it("should return 0 if _stakeId doesn't exist", async function () {
        const pool = getPool(this.ilvPool, this.lpPool, usingPool);

        await pool.connect(this.signers.alice).migrateLockedStake([0, 2]);

        const aliceInvalidV1StakePosition = await pool.getV1StakePosition(this.signers.alice.address, 4);

        expect(aliceInvalidV1StakePosition).to.be.equal(0);
      });
      it("should migrate locked stakes - carol", async function () {
        const pool = getPool(this.ilvPool, this.lpPool, usingPool);

        await pool.connect(this.signers.carol).migrateLockedStake([0, 2]);

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

        await pool.connect(this.signers.carol).migrateLockedStake([0, 2]);
        await expect(pool.connect(this.signers.carol).migrateLockedStake([0, 2])).reverted;
      });
      it("should revert if migrating yield", async function () {
        const pool = getPool(this.ilvPool, this.lpPool, usingPool);

        await expect(pool.connect(this.signers.carol).migrateLockedStake([1])).reverted;
        await expect(pool.connect(this.signers.alice).migrateLockedStake([1])).reverted;
      });
      it("should revert if migrating unlocked stake", async function () {
        const pool = getPool(this.ilvPool, this.lpPool, usingPool);

        await expect(pool.connect(this.signers.bob).migrateLockedStake([0])).reverted;
      });
      it("should revert if lockedFrom > v1StakeMaxPeriod", async function () {
        const pool = getPool(this.ilvPool, this.lpPool, usingPool);

        await expect(pool.connect(this.signers.bob).migrateLockedStake([1])).reverted;
      });
    });
  };
}

export function mintV1Yield(): () => void {
  return function () {
    beforeEach(async function () {
      const users = getUsers1([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPool.migrateWeights(
        [this.signers.alice.address],
        [users[0].deposits[1].weight],
        users[0].deposits[1].weight,
      );
      await this.ilvPoolV1.setUsers(users);
    });

    it("should mint v1 yield", async function () {
      const ilvBalance0 = await this.ilv.balanceOf(this.signers.alice.address);

      await this.ilvPool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await this.ilvPool.connect(this.signers.alice).mintV1Yield(1);

      const ilvBalance1 = await this.ilv.balanceOf(this.signers.alice.address);
      expect(ilvBalance1.sub(ilvBalance0)).to.be.equal(toWei(500));
    });
    it("should revert if stake !isYield", async function () {
      await this.ilvPool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await expect(this.ilvPool.connect(this.signers.alice).mintV1Yield(0)).reverted;
    });
    it("should revert if lockedUntil > _now256", async function () {
      await expect(this.ilvPool.connect(this.signers.alice).mintV1Yield(1)).reverted;
    });
    it("should revert if yield is already minted", async function () {
      await this.ilvPool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await this.ilvPool.connect(this.signers.alice).mintV1Yield(1);
      await expect(this.ilvPool.connect(this.signers.alice).mintV1Yield(1)).reverted;
    });
    it("should mint multiple v1 yield stake", async function () {
      const users = getUsers1([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPool.migrateWeights(
        [this.signers.carol.address],
        [users[2].deposits[0].weight.add(users[2].deposits[1].weight).add(users[2].deposits[2].weight)],
        users[2].deposits[0].weight.add(users[2].deposits[1].weight).add(users[2].deposits[2].weight),
      );

      const ilvBalance0 = await this.ilv.balanceOf(this.signers.carol.address);

      await this.ilvPool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await this.ilvPool.connect(this.signers.carol).mintV1YieldMultiple([0, 1, 2]);

      const ilvBalance1 = await this.ilv.balanceOf(this.signers.carol.address);

      expect(ilvBalance1.sub(ilvBalance0)).to.be.equal(
        users[2].deposits[0].tokenAmount.add(users[2].deposits[1].tokenAmount).add(users[2].deposits[2].tokenAmount),
      );
    });
    it("should revert minting multiple yield stakes if already minted", async function () {
      const users = getUsers1([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPool.migrateWeights(
        [this.signers.carol.address],
        [users[2].deposits[0].weight.add(users[2].deposits[1].weight).add(users[2].deposits[2].weight)],
        users[2].deposits[0].weight.add(users[2].deposits[1].weight).add(users[2].deposits[2].weight),
      );

      await this.ilvPool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await this.ilvPool.connect(this.signers.carol).mintV1YieldMultiple([0, 1, 2]);
      await expect(this.ilvPool.connect(this.signers.carol).mintV1YieldMultiple([0, 1, 2])).reverted;
    });
    it("should revert if passing !isYield _stakeId", async function () {
      const users = getUsers1([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPool.migrateWeights(
        [this.signers.alice.address],
        [users[0].deposits[0].weight.add(users[0].deposits[1].weight).add(users[0].deposits[2].weight)],
        users[0].deposits[0].weight.add(users[0].deposits[1].weight).add(users[0].deposits[2].weight),
      );

      await this.ilvPool.setNow256(INIT_TIME + ONE_YEAR + 1);
      await expect(this.ilvPool.connect(this.signers.alice).mintV1YieldMultiple([0, 1, 2])).reverted;
    });
    it("should revert on mintYieldMultiple if yield is locked", async function () {
      const users = getUsers1([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPool.migrateWeights(
        [this.signers.alice.address],
        [users[0].deposits[0].weight.add(users[0].deposits[1].weight).add(users[0].deposits[2].weight)],
        users[0].deposits[0].weight.add(users[0].deposits[1].weight).add(users[0].deposits[2].weight),
      );

      await this.ilvPool.setNow256(INIT_TIME);
      await expect(this.ilvPool.connect(this.signers.alice).mintV1YieldMultiple([0, 1, 2])).reverted;
    });
  };
}

export function updateStakeLock(usingPool: string): () => void {
  return function () {
    it("should update stake lock to two years", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), INIT_TIME + 11);

      await pool.setNow256(INIT_TIME + 10);

      const { lockedUntil: lockedUntil0 } = await pool
        .connect(this.signers.alice)
        .getStake(this.signers.alice.address, 0);

      const { lockedFrom: lockedFrom0 } = await pool
        .connect(this.signers.alice.address)
        .getStake(this.signers.alice.address, 0);

      await pool.connect(this.signers.alice).updateStakeLock(0, INIT_TIME + 10 + ONE_YEAR * 2);

      const { lockedUntil: lockedUntil1 } = await pool
        .connect(this.signers.alice)
        .getStake(this.signers.alice.address, 0);

      const { lockedFrom: lockedFrom1 } = await pool
        .connect(this.signers.alice.address)
        .getStake(this.signers.alice.address, 0);

      expect(lockedUntil0).to.be.equal(INIT_TIME + 11);
      expect(lockedFrom0).to.be.equal(0);
      expect(lockedUntil1).to.be.equal(INIT_TIME + 10 + ONE_YEAR * 2);
      expect(lockedFrom1).to.be.equal(INIT_TIME + 10);
    });
    it("should revert if _lockedUntil < _now256", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), INIT_TIME);

      await pool.setNow256(INIT_TIME + 10);

      await expect(pool.connect(this.signers.alice).updateStakeLock(0, INIT_TIME + 9)).reverted;
    });
    it("should revert if _lockedUntil < previous _lockedUntil", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), INIT_TIME);

      await pool.setNow256(INIT_TIME - 2);

      await expect(pool.connect(this.signers.alice).updateStakeLock(0, INIT_TIME - 1)).reverted;

      await pool.connect(this.signers.alice).updateStakeLock(0, INIT_TIME + 10);
      await pool.connect(this.signers.alice).updateStakeLock(0, INIT_TIME + 20);

      await expect(pool.connect(this.signers.alice).updateStakeLock(0, INIT_TIME + ONE_YEAR * 2 + 21)).reverted;
    });
    it("should revert if locking for more than two years", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), INIT_TIME);

      await pool.setNow256(INIT_TIME);

      await expect(pool.connect(this.signers.alice).updateStakeLock(0, INIT_TIME + ONE_YEAR * 2 + 1)).reverted;
    });
  };
}

export function sync(usingPool: string): () => void {
  return function () {
    it("should sync pool state", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeFlexible(toWei(100));

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
        .div(toWei(100));

      expect(expectedLastYieldDistribution).to.be.equal(lastYieldDistribution);
      expect(expectedYieldRewardsPerWeight).to.be.equal(yieldRewardsPerWeight);
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
      await pool.connect(this.signers.alice).stakeFlexible(toWei(100));

      await pool.setNow256(END_TIME + 100);
      await pool.sync();
      await pool.setNow256(END_TIME + 200);
      await pool.sync();

      const poolWeight = await pool.weight();
      const totalWeight = await this.factory.totalWeight();

      const lastYieldDistribution = await pool.lastYieldDistribution();
      const yieldRewardsPerWeight = await pool.yieldRewardsPerWeight();

      const expectedLastYieldDistribution = ethers.BigNumber.from(END_TIME);
      const expectedYieldRewardsPerWeight = ILV_PER_SECOND.mul(END_TIME - INIT_TIME)
        .mul(poolWeight)
        .mul(1e6)
        .div(totalWeight)
        .div(toWei(100));

      expect(expectedLastYieldDistribution).to.be.equal(lastYieldDistribution);
      expect(expectedYieldRewardsPerWeight).to.be.equal(yieldRewardsPerWeight);
    });
    it("should update ilv per second after secondsPerUpdate", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeFlexible(toWei(100));

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

export function unstakeLocked(usingPool: string): () => void {
  return function () {
    it("should unstake locked tokens", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await pool.setNow256(ONE_YEAR * 2 + 1);

      const balance0 = await pool.balanceOf(this.signers.alice.address);
      const { value: value0 } = await pool.getStake(this.signers.alice.address, 0);

      await pool.connect(this.signers.alice).unstakeLocked(0, toWei(100));

      const balance1 = await pool.balanceOf(this.signers.alice.address);
      const { value: value1 } = await pool.getStake(this.signers.alice.address, 0);

      expect(balance0).to.be.equal(toWei(100));
      expect(value0).to.be.equal(toWei(100));
      expect(balance1).to.be.equal(0);
      expect(value1).to.be.equal(0);
    });
    it("should unstake locked tokens partially", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await pool.setNow256(ONE_YEAR * 2 + 1);

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
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await pool.setNow256(ONE_YEAR * 2 + 1);

      await expect(pool.connect(this.signers.alice).unstakeLocked(1, toWei(100))).reverted;
    });
    it("should revert when _value is 0", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await pool.setNow256(ONE_YEAR * 2 + 1);

      await expect(pool.connect(this.signers.alice).unstakeLocked(0, 0)).reverted;
    });
    it("should revert when _value is higher than stake", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await pool.setNow256(ONE_YEAR * 2 + 1);

      await expect(pool.connect(this.signers.alice).unstakeLocked(0, toWei(101))).reverted;
    });
    it("should revert when tokens are still locked", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await pool.setNow256(ONE_YEAR);

      await expect(pool.connect(this.signers.alice).unstakeLocked(0, toWei(100))).reverted;
    });
  };
}

export function unstakeFlexible(usingPool: string): () => void {
  return function () {
    it("should unstake flexible", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeFlexible(toWei(1000));

      await pool.connect(this.signers.alice).unstakeFlexible(toWei(1000));

      const poolBalance = await pool.balanceOf(this.signers.alice.address);

      expect(poolBalance.toNumber()).to.be.equal(0);
    });
    it("should revert unstaking 0", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeFlexible(toWei(1000));

      await expect(pool.connect(this.signers.alice).unstakeFlexible(0)).reverted;
    });
    it("should revert unstaking more than allowed", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeFlexible(toWei(1000));

      await expect(pool.connect(this.signers.alice).unstakeFlexible(toWei(1001))).reverted;
    });
    it("should process rewards on unstake", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeFlexible(toWei(1000));

      await pool.setNow256(INIT_TIME + 1);
      await pool.connect(this.signers.alice).unstakeFlexible(toWei(1));
      const { pendingYield } = await pool.users(this.signers.alice.address);

      const poolWeight = await pool.weight();
      const totalWeight = await this.factory.totalWeight();

      expect(pendingYield).to.be.equal(ILV_PER_SECOND.mul(poolWeight).div(totalWeight));
    });
  };
}

export function claimYieldRewardsMultiple(): () => void {
  return function () {
    it("should correctly claim multiple pools as ILV", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);
      await this.lpPool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await this.ilvPool.setNow256(INIT_TIME + 1000);
      await this.lpPool.setNow256(INIT_TIME + 1000);

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
      await this.ilvPool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);
      await this.lpPool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await this.ilvPool.setNow256(INIT_TIME + 1000);
      await this.lpPool.setNow256(INIT_TIME + 1000);

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
      await this.ilvPool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);
      await this.lpPool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await this.ilvPool.setNow256(INIT_TIME + 1000);
      await this.lpPool.setNow256(INIT_TIME + 1000);

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
    it("should revert if claiming from invalid pool", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);
      await this.lpPool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await this.ilvPool.setNow256(INIT_TIME + 1000);
      await this.lpPool.setNow256(INIT_TIME + 1000);

      await expect(
        this.ilvPool
          .connect(this.signers.alice)
          .claimYieldRewardsMultiple([this.ilvPool.address, this.signers.bob.address], [false, true]),
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
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await pool.setNow256(INIT_TIME + 100);

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
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await pool.setNow256(INIT_TIME + 100);

      await pool.connect(this.signers.alice).claimYieldRewards(false);

      await pool.setNow256(INIT_TIME + 101 + ONE_YEAR);

      const expectedMintedYield = ILV_PER_SECOND.mul(100).mul(poolWeight).div(totalWeight);
      const balanceBeforeMint = await this.ilv.balanceOf(this.signers.alice.address);

      if (usingPool === "ILV") {
        await pool.connect(this.signers.alice).unstakeLocked(1, expectedMintedYield);
      } else {
        await this.ilvPool.setNow256(INIT_TIME + 101 + ONE_YEAR);
        await this.ilvPool.connect(this.signers.alice).unstakeLocked(0, expectedMintedYield);
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
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await pool.setNow256(INIT_TIME + 100);

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
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await pool.setNow256(1);

      const { pendingYield } = await pool.pendingRewards(this.signers.alice.address);

      expect(pendingYield.toNumber()).to.be.equal(0);
    });
    it("should accumulate ILV correctly", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await pool.setNow256(INIT_TIME + 10);

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
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await token.connect(this.signers.bob).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.bob).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await pool.setNow256(INIT_TIME + 10);

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
      await pool.connect(this.signers.alice).stakeFlexible(toWei(10));

      await pool.setNow256(INIT_TIME + 50);

      const { pendingYield: aliceYield0 } = await pool.pendingRewards(this.signers.alice.address);

      const expectedAliceYield0 = ILV_PER_SECOND.mul(50).mul(poolWeight).div(totalWeight);

      await token.connect(this.signers.bob).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.bob).stakeAndLock(toWei(5000), ONE_YEAR * 2);

      const totalInPool = toWei(10 * 1e6).add(toWei(5000 * 2e6));

      const { pendingYield: bobYield0 } = await pool.pendingRewards(this.signers.bob.address);

      const expectedBobYield0 = 0;

      await pool.setNow256(INIT_TIME + 200);

      const { pendingYield: aliceYield1 } = await pool.pendingRewards(this.signers.alice.address);
      const { pendingYield: bobYield1 } = await pool.pendingRewards(this.signers.bob.address);

      const expectedAliceYield1 = Number(
        ethers.utils.formatEther(
          ILV_PER_SECOND.mul(150)
            .mul(toWei(10 * 1e6))
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

      expect(expectedAliceYield0).to.be.equal(aliceYield0);
      expect(expectedAliceYield1).to.be.equal(Number(ethers.utils.formatEther(aliceYield1)).toFixed(3));
      expect(expectedBobYield0).to.be.equal(bobYield0);
      expect(expectedBobYield1).to.be.equal(Number(ethers.utils.formatEther(bobYield1)).toFixed(3));
    });
    it("should not accumulate yield after endTime", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      const poolWeight = await pool.weight();
      const totalWeight = await this.factory.totalWeight();

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeFlexible(toWei(100));

      await pool.setNow256(INIT_TIME + 20);

      const expectedYield0 = ILV_PER_SECOND.mul(20).mul(poolWeight).div(totalWeight);

      const { pendingYield: aliceYield0 } = await pool.pendingRewards(this.signers.alice.address);

      await pool.setNow256(END_TIME);

      const expectedYield1 = ILV_PER_SECOND.mul(END_TIME - INIT_TIME)
        .mul(poolWeight)
        .div(totalWeight);

      const { pendingYield: aliceYield1 } = await pool.pendingRewards(this.signers.alice.address);

      await pool.setNow256(END_TIME + 100);

      const { pendingYield: aliceYield2 } = await pool.pendingRewards(this.signers.alice.address);

      expect(expectedYield0).to.be.equal(aliceYield0);
      expect(expectedYield1).to.be.equal(aliceYield1);
      expect(expectedYield1).to.be.equal(aliceYield2);
    });
  };
}

export function stakeAndLock(usingPool: string): () => void {
  return function () {
    it("should stake and lock", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeAndLock(toWei(50), ONE_YEAR * 2);

      await pool.connect(this.signers.alice).stakeAndLock(toWei(50), ONE_YEAR);

      const balance = await pool.balanceOf(this.signers.alice.address);

      expect(balance).to.be.equal(toWei(100));
    });
    it("should get correct stakesLength", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeAndLock(toWei(50), ONE_YEAR * 2);

      await pool.connect(this.signers.alice).stakeAndLock(toWei(50), ONE_YEAR);

      const balance = await pool.balanceOf(this.signers.alice.address);
      const stakesLength = await pool.getStakesLength(this.signers.alice.address);

      expect(balance).to.be.equal(toWei(100));
      expect(stakesLength).to.be.equal(2);
    });
    it("should revert when staking longer than 2 years", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await expect(pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2 + 1)).reverted;
    });
    it("should revert when _lockDuration = 0", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await expect(pool.connect(this.signers.alice).stakeAndLock(toWei(100), 0)).reverted;
    });
    it("should revert when _value = 0", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await expect(pool.connect(this.signers.alice).stakeAndLock(toWei(0), ONE_YEAR * 2)).reverted;
    });
  };
}

export function stakeFlexible(usingPool: string): () => void {
  return function () {
    it("should stake flexible", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeFlexible(toWei(1000));

      expect((await pool.balanceOf(await toAddress(this.signers.alice))).toString()).to.be.equal(toWei(1000));
    });

    it("should revert on _value 0", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await expect(pool.connect(this.signers.alice).stakeFlexible(toWei(0))).reverted;
    });
    it("should process rewards on stake", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeFlexible(toWei(1000));

      await pool.setNow256(INIT_TIME + 1);
      await pool.connect(this.signers.alice).stakeFlexible(toWei(1));
      const { pendingYield } = await pool.users(this.signers.alice.address);

      const poolWeight = await pool.weight();
      const totalWeight = await this.factory.totalWeight();

      expect(pendingYield).to.be.equal(ILV_PER_SECOND.mul(poolWeight).div(totalWeight));
    });
  };
}
