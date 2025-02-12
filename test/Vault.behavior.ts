import { ethers } from "hardhat";

import chai from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";

import { ONE_YEAR, toWei, getUsers0, getUsers3, INIT_TIME } from "./utils";

const { MaxUint256, AddressZero } = ethers.constants;

chai.use(solidity);
chai.use(chaiSubset);

const { expect } = chai;

export function setCorePools(): () => void {
  return function () {
    it("should set core pools correctly", async function () {
      const ilvPoolAddress = this.ilvPool.address;
      const lpPoolAddress = this.lpPool.address;
      const lockedPoolV1MockedAddress = this.ilvPool.address;
      const lockedPoolV2MockedAddress = this.lpPool.address;

      await this.vault
        .connect(this.signers.deployer)
        .setCorePools(ilvPoolAddress, lpPoolAddress, lockedPoolV1MockedAddress, lockedPoolV2MockedAddress);

      const { ilvPool, pairPool, lockedPoolV1, lockedPoolV2 } = await this.vault.pools();

      expect(ilvPool).to.be.equal(ilvPoolAddress);
      expect(pairPool).to.be.equal(lpPoolAddress);
      expect(lockedPoolV1).to.be.equal(lockedPoolV1MockedAddress);
      expect(lockedPoolV2).to.be.equal(lockedPoolV2MockedAddress);
    });
    it("should revert if ilvPool = address(0)", async function () {
      const lpPoolAddress = this.lpPool.address;
      const lockedPoolV1MockedAddress = this.ilvPool.address;
      const lockedPoolV2MockedAddress = this.ilvPool.address;

      await expect(
        this.vault
          .connect(this.signers.deployer)
          .setCorePools(AddressZero, lpPoolAddress, lockedPoolV1MockedAddress, lockedPoolV2MockedAddress),
      ).reverted;
    });

    it("should revert if pairPool = address(0)", async function () {
      const ilvPoolAddress = this.ilvPool.address;

      const lockedPoolV1MockedAddress = this.ilvPool.address;
      const lockedPoolV2MockedAddress = this.ilvPool.address;

      await expect(
        this.vault
          .connect(this.signers.deployer)
          .setCorePools(ilvPoolAddress, AddressZero, lockedPoolV1MockedAddress, lockedPoolV2MockedAddress),
      ).reverted;
    });

    it("should revert if lockedPoolV1 = address(0)", async function () {
      const ilvPoolAddress = this.ilvPool.address;
      const lpPoolAddress = this.lpPool.address;
      const lockedPoolV2MockedAddress = this.ilvPool.address;

      await expect(
        this.vault
          .connect(this.signers.deployer)
          .setCorePools(ilvPoolAddress, lpPoolAddress, AddressZero, lockedPoolV2MockedAddress),
      ).reverted;
    });

    it("should revert if lockedPoolV2 = address(0)", async function () {
      const ilvPoolAddress = this.ilvPool.address;
      const lpPoolAddress = this.lpPool.address;
      const lockedPoolV1MockedAddress = this.ilvPool.address;

      await expect(
        this.vault
          .connect(this.signers.deployer)
          .setCorePools(ilvPoolAddress, lpPoolAddress, lockedPoolV1MockedAddress, AddressZero),
      ).reverted;
    });
    it("should receive ether", async function () {
      await expect(this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(10) })).to.emit(
        this.vault,
        "LogEthReceived",
      );
    });
    it("should revert deploying vault with _sushiRouter = address(0)", async function () {
      await expect(this.Vault.deploy(AddressZero, this.ilv.address)).reverted;
    });
    it("should revert deploying vault with _ilv = address(0)", async function () {
      await expect(this.Vault.deploy(this.sushiRouter.address, AddressZero)).reverted;
    });
    it("should revert setting vault to address(0)", async function () {
      await expect(this.ilvPool.connect(this.signers.deployer).setVault(AddressZero)).reverted;
      await expect(this.lpPool.connect(this.signers.deployer).setVault(AddressZero)).reverted;
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
      const ilvPoolAddress = this.ilvPool.address;
      const lpPoolAddress = this.lpPool.address;
      const lockedPoolV1MockedAddress = this.ilvPool.address;
      const lockedPoolV2MockedAddress = this.ilvPool.address;

      await this.vault
        .connect(this.signers.deployer)
        .setCorePools(ilvPoolAddress, lpPoolAddress, lockedPoolV1MockedAddress, lockedPoolV2MockedAddress);

      await this.ilvPool.connect(this.signers.deployer).setVault(this.vault.address);
      await this.lpPool.connect(this.signers.deployer).setVault(this.vault.address);
    });
    it("should distribute ilv revenue", async function () {
      const users = getUsers0([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPoolV1.setUsers(users);
      await this.lpPoolV1.setUsers(users);

      const ilvPoolV1Reserve = await this.ilvPoolV1.usersLockingWeight();

      await this.ilvPool.setV1PoolTokenReserve(ilvPoolV1Reserve);

      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);

      await this.ilvPool.connect(this.signers.alice).stake(toWei(50), ONE_YEAR);
      await this.lpPool.connect(this.signers.alice).stake(toWei(50), ONE_YEAR);

      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(120) });
      const ethIn = toWei(50);

      const [, ilvOut] = await this.sushiRouter.getAmountsOut(ethIn, [this.weth.address, this.ilv.address]);

      await this.vault.swapETHForILV(ethIn, ilvOut, MaxUint256);

      const vaultILVBalance = await this.ilv.balanceOf(this.vault.address);

      const lockedPoolsMockedBalance = (await this.ilvPool.poolTokenReserve()).mul(2);

      const ilvPoolILVBalance0 = (await this.ilvPool.getTotalReserves()).add(lockedPoolsMockedBalance);
      const lpPoolILVBalance0 = await this.vault.estimatePairPoolReserve(this.lpPool.address);

      const ilvPoolILVReceived0 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived0 = await this.ilv.balanceOf(this.lpPool.address);

      const totalILVInPools = ilvPoolILVBalance0.add(lpPoolILVBalance0);

      const ilvPoolShare = ilvPoolILVBalance0.mul(toWei(100)).div(totalILVInPools);
      const lpPoolShare = lpPoolILVBalance0.mul(toWei(100)).div(totalILVInPools);

      await this.vault.sendILVRewards(0, 0, 0);

      const ilvPoolILVReceived1 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived1 = await this.ilv.balanceOf(this.lpPool.address);

      expect(ethers.utils.formatEther(ilvPoolILVReceived1.sub(ilvPoolILVReceived0)).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(ilvPoolShare.mul(vaultILVBalance).div(toWei(100))).slice(0, 6),
      );
      expect(ethers.utils.formatEther(lpPoolILVReceived1.sub(lpPoolILVReceived0)).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(lpPoolShare.mul(vaultILVBalance).div(toWei(100))).slice(0, 6),
      );
    });
    it("should buy and distribute ilv revenue in the same transaction", async function () {
      const users = getUsers0([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPoolV1.setUsers(users);
      await this.lpPoolV1.setUsers(users);

      const ilvPoolV1Reserve = await this.ilvPoolV1.usersLockingWeight();
      await this.ilvPool.setV1PoolTokenReserve(ilvPoolV1Reserve);

      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);

      await this.ilvPool.connect(this.signers.alice).stake(toWei(50), ONE_YEAR);
      await this.lpPool.connect(this.signers.alice).stake(toWei(50), ONE_YEAR);

      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(100) });
      const ethIn = toWei(50);

      const [, ilvOut] = await this.sushiRouter.getAmountsOut(ethIn, [this.weth.address, this.ilv.address]);

      const vaultILVBalance = ilvOut;

      const lockedPoolsMockedBalance = (await this.ilvPool.poolTokenReserve()).mul(2);

      const ilvPoolILVBalance0 = (await this.ilvPool.getTotalReserves())
        .add(await this.ilvPoolV1.poolTokenReserve())
        .add(lockedPoolsMockedBalance);

      const ilvPoolILVReceived0 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived0 = await this.ilv.balanceOf(this.lpPool.address);

      await this.vault.sendILVRewards(ethIn, ilvOut, MaxUint256);

      const lpPoolILVBalance = await this.vault.estimatePairPoolReserve(this.lpPool.address);
      const totalILVInPools = ilvPoolILVBalance0.add(lpPoolILVBalance);

      const ilvPoolShare = ilvPoolILVBalance0.mul(toWei(100)).div(totalILVInPools);
      const lpPoolShare = lpPoolILVBalance.mul(toWei(100)).div(totalILVInPools);

      const ilvPoolILVReceived1 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived1 = await this.ilv.balanceOf(this.lpPool.address);

      expect(ethers.utils.formatEther(ilvPoolILVReceived1.sub(ilvPoolILVReceived0)).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(ilvPoolShare.mul(vaultILVBalance).div(toWei(100))).slice(0, 6),
      );
      expect(ethers.utils.formatEther(lpPoolILVReceived1.sub(lpPoolILVReceived0)).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(lpPoolShare.mul(vaultILVBalance).div(toWei(100))).slice(0, 6),
      );
    });
    it("should send ilv rewards twice", async function () {
      const users = getUsers0([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPoolV1.setUsers(users);
      await this.lpPoolV1.setUsers(users);

      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);

      await this.ilvPool.connect(this.signers.alice).stake(toWei(50), ONE_YEAR);
      await this.lpPool.connect(this.signers.alice).stake(toWei(50), ONE_YEAR);

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
      const ilvPoolAddress = this.ilvPool.address;
      const lpPoolAddress = this.lpPool.address;
      const lockedPoolV1MockedAddress = this.ilvPool.address;
      const lockedPoolV2MockedAddress = this.ilvPool.address;

      await this.vault
        .connect(this.signers.deployer)
        .setCorePools(ilvPoolAddress, lpPoolAddress, lockedPoolV1MockedAddress, lockedPoolV2MockedAddress);

      await this.ilvPool.connect(this.signers.deployer).setVault(this.vault.address);
      await this.lpPool.connect(this.signers.deployer).setVault(this.vault.address);
    });
    it("should claim vault rewards", async function () {
      const users = getUsers3([this.signers.alice.address, this.signers.bob.address, this.signers.carol.address]);

      await this.ilvPoolV1.setUsers(users);
      await this.lpPoolV1.setUsers(users);

      await this.ilvPool.connect(this.signers.deployer).setV1GlobalWeight(await this.ilvPoolV1.usersLockingWeight());
      await this.lpPool.connect(this.signers.deployer).setV1GlobalWeight(await this.lpPoolV1.usersLockingWeight());

      await this.ilvPool.connect(this.signers.bob).migrateLockedStakes([0, 1]);
      await this.lpPool.connect(this.signers.bob).migrateLockedStakes([0, 1]);

      await this.ilv.connect(this.signers.bob).approve(this.ilvPool.address, MaxUint256);
      await this.lp.connect(this.signers.bob).approve(this.lpPool.address, MaxUint256);

      await this.ilvPool.connect(this.signers.bob).stake(toWei(50), ONE_YEAR);
      await this.lpPool.connect(this.signers.bob).stake(toWei(50), ONE_YEAR);

      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(100) });
      const ethIn = toWei(50);

      const [, ilvOut] = await this.sushiRouter.getAmountsOut(ethIn, [this.weth.address, this.ilv.address]);

      const ilvPoolILVReceived0 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived0 = await this.ilv.balanceOf(this.lpPool.address);

      await this.vault.sendILVRewards(ethIn, ilvOut, MaxUint256);

      const ilvPoolILVReceived1 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived1 = await this.ilv.balanceOf(this.lpPool.address);

      const ilvBalance0 = await this.ilv.balanceOf(this.signers.bob.address);

      const { pendingRevDis: alicePendingRevDisILVPool } = await this.ilvPool.pendingRewards(this.signers.bob.address);
      const { pendingRevDis: alicePendingRevDisLPPool } = await this.lpPool.pendingRewards(this.signers.bob.address);
      await this.ilvPool.connect(this.signers.bob).claimVaultRewards();

      const ilvBalance1 = await this.ilv.balanceOf(this.signers.bob.address);

      await this.lpPool.connect(this.signers.bob).claimVaultRewards();

      const ilvBalance2 = await this.ilv.balanceOf(this.signers.bob.address);

      expect(ethers.utils.formatEther(alicePendingRevDisILVPool).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(ilvPoolILVReceived1.sub(ilvPoolILVReceived0)).slice(0, 6),
      );
      expect(ethers.utils.formatEther(alicePendingRevDisLPPool).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(lpPoolILVReceived1.sub(lpPoolILVReceived0)).slice(0, 6),
      );
      expect(ilvBalance1.sub(ilvBalance0)).to.be.equal(alicePendingRevDisILVPool);
      expect(ilvBalance2.sub(ilvBalance1)).to.be.equal(alicePendingRevDisLPPool);
    });
    it("should return if 0 rev dis", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);

      await this.ilvPool.connect(this.signers.alice).stake(toWei(50), ONE_YEAR);
      await this.lpPool.connect(this.signers.alice).stake(toWei(50), ONE_YEAR);

      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(100) });

      const ilvPoolILVReceived0 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived0 = await this.ilv.balanceOf(this.lpPool.address);

      await this.vault.sendILVRewards(0, 0, 0);

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
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);

      await this.ilvPool.connect(this.signers.alice).stake(toWei(50), ONE_YEAR);
      await this.lpPool.connect(this.signers.alice).stake(toWei(50), ONE_YEAR);

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
    it("should revert if calling receiveVaultRewards from non-vault address", async function () {
      await expect(this.ilvPool.connect(this.signers.deployer).receiveVaultRewards(toWei(10))).reverted;
      await expect(this.lpPool.connect(this.signers.deployer).receiveVaultRewards(toWei(10))).reverted;
    });
  };
}

export function claimAllRewards(): () => void {
  return function () {
    beforeEach(async function () {
      const ilvPoolAddress = this.ilvPool.address;
      const lpPoolAddress = this.lpPool.address;
      const lockedPoolV1MockedAddress = this.ilvPool.address;
      const lockedPoolV2MockedAddress = this.ilvPool.address;

      await this.vault
        .connect(this.signers.deployer)
        .setCorePools(ilvPoolAddress, lpPoolAddress, lockedPoolV1MockedAddress, lockedPoolV2MockedAddress);

      await this.ilvPool.connect(this.signers.deployer).setVault(this.vault.address);
      await this.lpPool.connect(this.signers.deployer).setVault(this.vault.address);
    });
    it("should claim yield and vault rewards in one transaction", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.lp.connect(this.signers.alice).approve(this.lpPool.address, MaxUint256);

      await this.ilvPool.connect(this.signers.alice).stake(toWei(50), ONE_YEAR);
      await this.lpPool.connect(this.signers.alice).stake(toWei(50), ONE_YEAR);

      await this.signers.deployer.sendTransaction({ to: this.vault.address, value: toWei(100) });
      const ethIn = toWei(80);

      const [, ilvOut] = await this.sushiRouter.getAmountsOut(ethIn, [this.weth.address, this.ilv.address]);

      const ilvPoolILVReceived0 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived0 = await this.ilv.balanceOf(this.lpPool.address);

      await this.vault.sendILVRewards(ethIn, ilvOut, MaxUint256);

      const ilvPoolILVReceived1 = await this.ilv.balanceOf(this.ilvPool.address);
      const lpPoolILVReceived1 = await this.ilv.balanceOf(this.lpPool.address);

      const ilvBalance0 = await this.ilv.balanceOf(this.signers.alice.address);

      await this.ilvPool.setNow256(INIT_TIME + ONE_YEAR);
      await this.lpPool.setNow256(INIT_TIME + ONE_YEAR);

      const { pendingRevDis: alicePendingRevDisILVPool, pendingYield: alicePendingYieldILVPool } =
        await this.ilvPool.pendingRewards(this.signers.alice.address);
      const { pendingRevDis: alicePendingRevDisLPPool, pendingYield: alicePendingYieldLPPool } =
        await this.lpPool.pendingRewards(this.signers.alice.address);

      await this.ilvPool.connect(this.signers.alice).claimAllRewards(true);
      await this.lpPool.connect(this.signers.alice).claimAllRewards(false);

      const ilvBalance1 = await this.ilv.balanceOf(this.signers.alice.address);
      const silvBalance = await this.silv.balanceOf(this.signers.alice.address);
      const { value: ilvYieldStake } = await this.ilvPool.getStake(this.signers.alice.address, 1);

      expect(ethers.utils.formatEther(alicePendingRevDisILVPool).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(ilvPoolILVReceived1.sub(ilvPoolILVReceived0)).slice(0, 6),
      );
      expect(ethers.utils.formatEther(alicePendingRevDisLPPool).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(lpPoolILVReceived1.sub(lpPoolILVReceived0)).slice(0, 6),
      );
      expect(ilvBalance1.sub(ilvBalance0)).to.be.equal(alicePendingRevDisILVPool.add(alicePendingRevDisLPPool));
      expect(silvBalance).to.be.equal(alicePendingYieldILVPool);
      expect(ilvYieldStake).to.be.equal(alicePendingYieldLPPool);
    });
  };
}
