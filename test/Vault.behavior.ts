import { ethers } from "hardhat";

import chai from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";

import {
  ILV_PER_SECOND,
  INIT_TIME,
  END_TIME,
  ONE_YEAR,
  toWei,
  toAddress,
  getToken,
  getPool,
  getV1Pool,
  getUsers0,
  getUsers1,
} from "./utils";

const { MaxUint256, AddressZero } = ethers.constants;

chai.use(solidity);
chai.use(chaiSubset);

const { expect } = chai;

export function setCorePools(): () => void {
  return function () {
    it("should set core pools correctly", async function () {
      const ilvPoolV1Address = this.ilvPoolV1.address;
      const lpPoolV1Address = this.lpPoolV1.address;
      const ilvPoolAddress = this.ilvPool.address;
      const lpPoolAddress = this.lpPool.address;
      const lockedPoolV1MockedAddress = this.ilvPool.address;
      const lockedPoolV2MockedAddress = this.ilvPool.address;

      await this.vault
        .connect(this.signers.deployer)
        .setCorePools(
          ilvPoolV1Address,
          lpPoolV1Address,
          ilvPoolAddress,
          lpPoolAddress,
          lockedPoolV1MockedAddress,
          lockedPoolV2MockedAddress,
        );

      const { ilvPoolV1, pairPoolV1, ilvPool, pairPool, lockedPoolV1, lockedPoolV2 } = await this.vault.pools();

      expect(ilvPoolV1).to.be.equal(ilvPoolV1Address);
      expect(pairPoolV1).to.be.equal(lpPoolV1Address);
      expect(ilvPool).to.be.equal(ilvPoolAddress);
      expect(pairPool).to.be.equal(lpPoolAddress);
      expect(lockedPoolV1).to.be.equal(lockedPoolV1MockedAddress);
      expect(lockedPoolV2).to.be.equal(lockedPoolV2MockedAddress);
    });
    it("should revert if ilvPoolV1 = address(0)", async function () {
      const lpPoolV1Address = this.lpPoolV1.address;
      const ilvPoolAddress = this.ilvPool.address;
      const lpPoolAddress = this.lpPool.address;
      const lockedPoolV1MockedAddress = this.ilvPool.address;
      const lockedPoolV2MockedAddress = this.ilvPool.address;

      await expect(
        this.vault
          .connect(this.signers.deployer)
          .setCorePools(
            AddressZero,
            lpPoolV1Address,
            ilvPoolAddress,
            lpPoolAddress,
            lockedPoolV1MockedAddress,
            lockedPoolV2MockedAddress,
          ),
      ).reverted;
    });
    it("should revert if pairPoolV1 = address(0)", async function () {
      const ilvPoolV1Address = this.ilvPoolV1.address;

      const ilvPoolAddress = this.ilvPool.address;
      const lpPoolAddress = this.lpPool.address;
      const lockedPoolV1MockedAddress = this.ilvPool.address;
      const lockedPoolV2MockedAddress = this.ilvPool.address;

      await expect(
        this.vault
          .connect(this.signers.deployer)
          .setCorePools(
            ilvPoolV1Address,
            AddressZero,
            ilvPoolAddress,
            lpPoolAddress,
            lockedPoolV1MockedAddress,
            lockedPoolV2MockedAddress,
          ),
      ).reverted;
    });
    it("should revert if ilvPool = address(0)", async function () {
      const ilvPoolV1Address = this.ilvPoolV1.address;
      const lpPoolV1Address = this.lpPoolV1.address;

      const lpPoolAddress = this.lpPool.address;
      const lockedPoolV1MockedAddress = this.ilvPool.address;
      const lockedPoolV2MockedAddress = this.ilvPool.address;

      await expect(
        this.vault
          .connect(this.signers.deployer)
          .setCorePools(
            ilvPoolV1Address,
            lpPoolV1Address,
            AddressZero,
            lpPoolAddress,
            lockedPoolV1MockedAddress,
            lockedPoolV2MockedAddress,
          ),
      ).reverted;
    });

    it("should revert if pairPool = address(0)", async function () {
      const ilvPoolV1Address = this.ilvPoolV1.address;
      const lpPoolV1Address = this.lpPoolV1.address;
      const ilvPoolAddress = this.ilvPool.address;

      const lockedPoolV1MockedAddress = this.ilvPool.address;
      const lockedPoolV2MockedAddress = this.ilvPool.address;

      await expect(
        this.vault
          .connect(this.signers.deployer)
          .setCorePools(
            ilvPoolV1Address,
            lpPoolV1Address,
            ilvPoolAddress,
            AddressZero,
            lockedPoolV1MockedAddress,
            lockedPoolV2MockedAddress,
          ),
      ).reverted;
    });

    it("should revert if lockedPoolV1 = address(0)", async function () {
      const ilvPoolV1Address = this.ilvPoolV1.address;
      const lpPoolV1Address = this.lpPoolV1.address;
      const ilvPoolAddress = this.ilvPool.address;
      const lpPoolAddress = this.lpPool.address;
      const lockedPoolV2MockedAddress = this.ilvPool.address;

      await expect(
        this.vault
          .connect(this.signers.deployer)
          .setCorePools(
            ilvPoolV1Address,
            lpPoolV1Address,
            ilvPoolAddress,
            lpPoolAddress,
            AddressZero,
            lockedPoolV2MockedAddress,
          ),
      ).reverted;
    });

    it("should revert if lockedPoolV2 = address(0)", async function () {
      const ilvPoolV1Address = this.ilvPoolV1.address;
      const lpPoolV1Address = this.lpPoolV1.address;
      const ilvPoolAddress = this.ilvPool.address;
      const lpPoolAddress = this.lpPool.address;
      const lockedPoolV1MockedAddress = this.ilvPool.address;

      await expect(
        this.vault
          .connect(this.signers.deployer)
          .setCorePools(
            ilvPoolV1Address,
            lpPoolV1Address,
            ilvPoolAddress,
            lpPoolAddress,
            lockedPoolV1MockedAddress,
            AddressZero,
          ),
      ).reverted;
    });
    it("should receive ether", async function () {
      await expect(this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(10) })).to.emit(
        this.vault,
        "LogEthReceived",
      );
    });
  };
}

export function swapETHForILV(): () => void {
  return function () {
    it("should swap contract eth balance to ILV", async function () {
      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(10) });
      const ethIn = toWei(5);

      const [, ilvOut] = await this.sushiRouter.getAmountsOut(ethIn, [this.weth.address, this.ilv.address]);

      await this.vault.swapETHForILV(ethIn, ilvOut, MaxUint256);

      const vaultILVBalance = await this.ilv.balanceOf(this.vault.address);

      expect(vaultILVBalance).to.be.equal(ilvOut);
    });
    it("should revert if _ilvOut = 0", async function () {
      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(10) });
      const ethIn = toWei(5);

      await expect(this.vault.swapETHForILV(ethIn, 0, MaxUint256)).reverted;
    });
  };
}
