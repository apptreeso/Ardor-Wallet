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
  toWei,
  toAddress,
  getToken,
  getPool,
} from "./utils";

const { MaxUint256 } = ethers.constants;

chai.use(solidity);
chai.use(chaiSubset);

const { expect } = chai;

export function stakeFlexible(usingPool: string): () => void {
  return function () {
    it("should stake correctly", async function () {
      const token = getToken(this.ilv, this.lp, usingPool);
      const pool = getPool(this.ilvPool, this.lpPool, usingPool);

      await token.connect(this.signers.alice).approve(pool.address, MaxUint256);
      await pool.connect(this.signers.alice).stakeFlexible(toWei(1000));

      this.ilv.address;

      expect((await pool.balanceOf(await toAddress(this.signers.alice))).toString()).to.equal(toWei(1000));
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
      expect(rewards.pendingYield).to.be.equal(ILV_PER_SECOND.mul(200).div(1000));
    });
  };
}
