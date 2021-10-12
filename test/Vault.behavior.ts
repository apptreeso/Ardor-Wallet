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
      const lockedPoolV2MockedAddress = this.lpPool.address;

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
    it("should revert deploying vault with _sushiRouter = address(0", async function () {
      await expect(this.Vault.deploy(AddressZero, this.ilv.address)).reverted;
    });
    it("should revert deploying vault with _ilv = address(0", async function () {
      await expect(this.Vault.deploy(this.sushiRouter.address, AddressZero)).reverted;
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
    it("should revert if _ethIn = 0", async function () {
      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(10) });
      const ethIn = toWei(5);

      const [, ilvOut] = await this.sushiRouter.getAmountsOut(ethIn, [this.weth.address, this.ilv.address]);

      await expect(this.vault.swapETHForILV(0, ilvOut, MaxUint256)).reverted;
    });
    it("should revert if deadline = 0", async function () {
      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(10) });
      const ethIn = toWei(5);

      const [, ilvOut] = await this.sushiRouter.getAmountsOut(ethIn, [this.weth.address, this.ilv.address]);

      await expect(this.vault.swapETHForILV(ethIn, ilvOut, 0)).reverted;
    });
    it("should revert if not enough eth", async function () {
      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(10) });
      const ethIn = toWei(500000000);

      const [, ilvOut] = await this.sushiRouter.getAmountsOut(ethIn, [this.weth.address, this.ilv.address]);

      await expect(this.vault.swapETHForILV(ethIn, ilvOut, MaxUint256)).reverted;
    });
  };
}

export function sendILVRewards(): () => void {
  return function () {
    beforeEach(async function () {
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

      await this.ilvPool.connect(this.signers.deployer).setVault(this.vault.address);
      await this.lpPool.connect(this.signers.deployer).setVault(this.vault.address);
    });
    it("should distribute ilv revenue", async function () {
      const users = getUsers0([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPoolV1.setUsers(users);
      await this.lpPoolV1.setUsers(users);

      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);

      await this.ilvPool.connect(this.signers.alice).stakeAndLock(toWei(50), ONE_YEAR * 2);
      await this.lpPool.connect(this.signers.alice).stakeAndLock(toWei(50), ONE_YEAR * 2);

      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(120) });
      const ethIn = toWei(50);

      const [, ilvOut] = await this.sushiRouter.getAmountsOut(ethIn, [this.weth.address, this.ilv.address]);

      await this.vault.swapETHForILV(ethIn, ilvOut, MaxUint256);

      const vaultILVBalance = await this.ilv.balanceOf(this.vault.address);

      const lockedPoolsMockedBalance = (await this.ilvPool.poolTokenReserve()).mul(2);

      const ilvPoolILVBalance0 = (await this.ilvPool.poolTokenReserve())
        .add(await this.ilvPoolV1.poolTokenReserve())
        .add(lockedPoolsMockedBalance);
      const lpPoolILVBalance0 = (await this.vault.estimatePairPoolReserve(this.lpPool.address)).add(
        await this.vault.estimatePairPoolReserve(this.lpPoolV1.address),
      );

      const ilvPoolILVReceived0 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived0 = await this.ilv.balanceOf(this.lpPool.address);

      const totalILVInPools = ilvPoolILVBalance0.add(lpPoolILVBalance0);

      const ilvPoolShare = ilvPoolILVBalance0.mul(1e12).div(totalILVInPools);
      const lpPoolShare = lpPoolILVBalance0.mul(1e12).div(totalILVInPools);

      await this.vault.sendILVRewards(0, 0, 0);

      const ilvPoolILVReceived1 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived1 = await this.ilv.balanceOf(this.lpPool.address);

      expect(ethers.utils.formatEther(ilvPoolILVReceived1.sub(ilvPoolILVReceived0)).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(ilvPoolShare.mul(vaultILVBalance).div(1e12)).slice(0, 6),
      );
      expect(ethers.utils.formatEther(lpPoolILVReceived1.sub(lpPoolILVReceived0)).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(lpPoolShare.mul(vaultILVBalance).div(1e12)).slice(0, 6),
      );
    });
    it("should buy and distribute ilv revenue in the same transaction", async function () {
      const users = getUsers0([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPoolV1.setUsers(users);
      await this.lpPoolV1.setUsers(users);

      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);

      await this.ilvPool.connect(this.signers.alice).stakeAndLock(toWei(50), ONE_YEAR * 2);
      await this.lpPool.connect(this.signers.alice).stakeAndLock(toWei(50), ONE_YEAR * 2);

      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(100) });
      const ethIn = toWei(50);

      const [, ilvOut] = await this.sushiRouter.getAmountsOut(ethIn, [this.weth.address, this.ilv.address]);

      const vaultILVBalance = ilvOut;

      const lockedPoolsMockedBalance = (await this.ilvPool.poolTokenReserve()).mul(2);

      const ilvPoolILVBalance0 = (await this.ilvPool.poolTokenReserve())
        .add(await this.ilvPoolV1.poolTokenReserve())
        .add(lockedPoolsMockedBalance);

      const ilvPoolILVReceived0 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived0 = await this.ilv.balanceOf(this.lpPool.address);

      await this.vault.sendILVRewards(ethIn, ilvOut, MaxUint256);

      const lpPoolILVBalance = (await this.vault.estimatePairPoolReserve(this.lpPool.address)).add(
        await this.vault.estimatePairPoolReserve(this.lpPoolV1.address),
      );
      const totalILVInPools = ilvPoolILVBalance0.add(lpPoolILVBalance);

      const ilvPoolShare = ilvPoolILVBalance0.mul(1e12).div(totalILVInPools);
      const lpPoolShare = lpPoolILVBalance.mul(1e12).div(totalILVInPools);

      const ilvPoolILVReceived1 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived1 = await this.ilv.balanceOf(this.lpPool.address);

      expect(ethers.utils.formatEther(ilvPoolILVReceived1.sub(ilvPoolILVReceived0)).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(ilvPoolShare.mul(vaultILVBalance).div(1e12)).slice(0, 6),
      );
      expect(ethers.utils.formatEther(lpPoolILVReceived1.sub(lpPoolILVReceived0)).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(lpPoolShare.mul(vaultILVBalance).div(1e12)).slice(0, 6),
      );
    });
    it("should send ilv rewards twice", async function () {
      const users = getUsers0([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPoolV1.setUsers(users);
      await this.lpPoolV1.setUsers(users);

      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);

      await this.ilvPool.connect(this.signers.alice).stakeAndLock(toWei(50), ONE_YEAR * 2);
      await this.lpPool.connect(this.signers.alice).stakeAndLock(toWei(50), ONE_YEAR * 2);

      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(120) });
      const ethIn = toWei(50);

      const [, ilvOut] = await this.sushiRouter.getAmountsOut(ethIn, [this.weth.address, this.ilv.address]);

      await this.vault.swapETHForILV(ethIn, ilvOut, MaxUint256);

      await this.vault.sendILVRewards(0, 0, 0);

      const [, newILVOut] = await this.sushiRouter.getAmountsOut(ethIn, [this.weth.address, this.ilv.address]);

      await this.vault.swapETHForILV(ethIn, newILVOut, MaxUint256);

      await this.vault.sendILVRewards(0, 0, 0);

      const vaultILVBalance = await this.ilv.balanceOf(this.vault.address);

      expect(Number(ethers.utils.formatEther(vaultILVBalance))).to.be.lessThan(1);
    });
  };
}

export function claimVaultRewards(): () => void {
  return function () {
    beforeEach(async function () {
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

      await this.ilvPool.connect(this.signers.deployer).setVault(this.vault.address);
      await this.lpPool.connect(this.signers.deployer).setVault(this.vault.address);
    });
    it("should claim vault rewards", async function () {
      const users = getUsers0([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPoolV1.setUsers(users);
      await this.lpPoolV1.setUsers(users);

      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);

      await this.ilvPool.connect(this.signers.alice).stakeAndLock(toWei(50), ONE_YEAR * 2);
      await this.lpPool.connect(this.signers.alice).stakeAndLock(toWei(50), ONE_YEAR * 2);

      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(100) });
      const ethIn = toWei(50);

      const [, ilvOut] = await this.sushiRouter.getAmountsOut(ethIn, [this.weth.address, this.ilv.address]);

      const ilvPoolILVReceived0 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived0 = await this.ilv.balanceOf(this.lpPool.address);

      await this.vault.sendILVRewards(ethIn, ilvOut, MaxUint256);

      const ilvPoolILVReceived1 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived1 = await this.ilv.balanceOf(this.lpPool.address);

      const ilvBalance0 = await this.ilv.balanceOf(this.signers.alice.address);

      const { pendingRevDis: alicePendingRevDisILVPool } = await this.ilvPool.pendingRewards(
        this.signers.alice.address,
      );
      const { pendingRevDis: alicePendingRevDisLPPool } = await this.lpPool.pendingRewards(this.signers.alice.address);

      await this.ilvPool.connect(this.signers.alice).claimVaultRewards();

      const ilvBalance1 = await this.ilv.balanceOf(this.signers.alice.address);

      await this.lpPool.connect(this.signers.alice).claimVaultRewards();

      const ilvBalance2 = await this.ilv.balanceOf(this.signers.alice.address);

      expect(ethers.utils.formatEther(alicePendingRevDisILVPool).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(ilvPoolILVReceived1.sub(ilvPoolILVReceived0)).slice(0, 6),
      );
      expect(ethers.utils.formatEther(alicePendingRevDisLPPool).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(lpPoolILVReceived1.sub(lpPoolILVReceived0)).slice(0, 6),
      );
      expect(ilvBalance1.sub(ilvBalance0)).to.be.equal(alicePendingRevDisILVPool);
      expect(ilvBalance2.sub(ilvBalance1)).to.be.equal(alicePendingRevDisLPPool);
    });
    it("should claim vault rewards in multiple pools", async function () {
      const users = getUsers0([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPoolV1.setUsers(users);
      await this.lpPoolV1.setUsers(users);

      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);

      await this.ilvPool.connect(this.signers.alice).stakeAndLock(toWei(50), ONE_YEAR * 2);
      await this.lpPool.connect(this.signers.alice).stakeAndLock(toWei(50), ONE_YEAR * 2);

      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(100) });
      const ethIn = toWei(80);

      const [, ilvOut] = await this.sushiRouter.getAmountsOut(ethIn, [this.weth.address, this.ilv.address]);

      const ilvPoolILVReceived0 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived0 = await this.ilv.balanceOf(this.lpPool.address);

      await this.vault.sendILVRewards(ethIn, ilvOut, MaxUint256);

      const ilvPoolILVReceived1 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived1 = await this.ilv.balanceOf(this.lpPool.address);

      const ilvBalance0 = await this.ilv.balanceOf(this.signers.alice.address);

      const { pendingRevDis: alicePendingRevDisILVPool } = await this.ilvPool.pendingRewards(
        this.signers.alice.address,
      );
      const { pendingRevDis: alicePendingRevDisLPPool } = await this.lpPool.pendingRewards(this.signers.alice.address);

      await this.ilvPool
        .connect(this.signers.alice)
        .claimVaultRewardsMultiple([this.ilvPool.address, this.lpPool.address]);

      const ilvBalance1 = await this.ilv.balanceOf(this.signers.alice.address);

      expect(ethers.utils.formatEther(alicePendingRevDisILVPool).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(ilvPoolILVReceived1.sub(ilvPoolILVReceived0)).slice(0, 6),
      );
      expect(ethers.utils.formatEther(alicePendingRevDisLPPool).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(lpPoolILVReceived1.sub(lpPoolILVReceived0)).slice(0, 6),
      );
      expect(ilvBalance1.sub(ilvBalance0)).to.be.equal(alicePendingRevDisILVPool.add(alicePendingRevDisLPPool));
    });
  };
}
