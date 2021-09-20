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
} from "./utils";

const { MaxUint256 } = ethers.constants;

chai.use(solidity);
chai.use(chaiSubset);

const { expect } = chai;

export function pendingYield(usingPool?: string): () => void {
  return function () {
    it("should not accumulate rewards before init time", async function () {
      const token = getToken(this.ilv, this.lp, usingPool as string);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool as string);

      await pool.setNow256(0);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);

      await pool.setNow256(1);

      const { pendingYield } = await pool.pendingRewards(this.signers.alice.address);

      expect(pendingYield.toNumber()).to.be.equal(0);
    });
    it("should accumulate ILV correctly", async function () {
      const token = getToken(this.ilv, this.lp, usingPool as string);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool as string);

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
      const token = getToken(this.ilv, this.lp, usingPool as string);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool as string);

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
      const token = getToken(this.ilv, this.lp, usingPool as string);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool as string);

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
    // it("should not accumulate yield after yield farming ends", async () => {
    //   await ilv.approve(ilvPool.address, MAX_UINT256, { from: bob });
    //   await ilv.approve(ilvPool.address, MAX_UINT256, { from: carol });

    //   await ilvPool.stake(500, 0, false, { from: bob });
    //   await ilvPool.stake(500, 0, false, { from: carol });

    //   await ilvPool.setBlockNumber(1010);

    //   const pendingYield0 = Number(await ilvPool.pendingYieldRewards(carol));
    //   const expectedYield0 = 10000 / 2;

    //   await ilvPool.setBlockNumber(7117500);

    //   const pendingYield1 = Number(await ilvPool.pendingYieldRewards(carol));
    //   // calculates based on total ILV emitted / 2 (since we have 2 stakers with same weights)
    //   const expectedYield1 = ((7117500 - 10) * 10) / 2;

    //   await ilvPool.setBlockNumber(99999999999);

    //   const pendingYieldFinal0 = Number(await ilvPool.pendingYieldRewards(carol));

    //   await ilvPool.sync();

    //   const pendingYieldFinal1 = Number(await ilvPool.pendingYieldRewards(carol));

    //   await ilvPool.processRewards(false, { from: carol });
    //   const balance = Number(await ilvPool.balanceOf(carol));
    //   // expected yield + original stake
    //   const expectedBalance = expectedYield1 + 500;

    //   expect(pendingYield0).to.equal(expectedYield0);
    //   expect(pendingYield1).to.equal(expectedYield1);
    //   expect(pendingYieldFinal0).to.equal(expectedYield1);
    //   expect(pendingYieldFinal1).to.equal(expectedYield1);
    //   expect(balance).to.equal(expectedBalance);
    // });
  };
}

export function stakeAndLock(usingPool: string): () => void {
  return function () {
    it("should stake and lock", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeAndLock(toWei(100), ONE_YEAR * 2);
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
    it("should processRewards on stake", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeFlexible(toWei(1000));

      await pool.setNow256(INIT_TIME + 1);
      const rewards = await pool.pendingRewards(await toAddress(this.signers.alice));

      const poolWeight = await pool.weight();
      const totalWeight = await this.factory.totalWeight();

      expect(rewards.pendingYield).to.be.equal(ILV_PER_SECOND.mul(poolWeight).div(totalWeight));
    });
  };
}
