import chai from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";
import { ethers, upgrades } from "hardhat";
import {
  ILVPoolMock__factory,
  ILVPoolMock,
  FlashPoolMock__factory,
  FlashPoolMock,
  PoolFactoryMock__factory,
  PoolFactoryMock,
  CorePoolV1Mock__factory,
  ERC20Mock__factory,
  Signers,
} from "../types";

import {
  ILV_PER_SECOND,
  SECONDS_PER_UPDATE,
  INIT_TIME,
  FLASH_INIT_TIME,
  FLASH_POOL_WEIGHT,
  END_TIME,
  ILV_POOL_WEIGHT,
  V1_STAKE_MAX_PERIOD,
  toWei,
} from "./utils";

const { MaxUint256 } = ethers.constants;

chai.use(solidity);
chai.use(chaiSubset);

const { expect } = chai;

describe("FlashPool", function () {
  before(async function () {
    this.signers = {} as Signers;

    this.ILVPool = <ILVPoolMock__factory>await ethers.getContractFactory("ILVPoolMock");
    this.FlashPool = <FlashPoolMock__factory>await ethers.getContractFactory("FlashPoolMock");
    this.PoolFactory = <PoolFactoryMock__factory>await ethers.getContractFactory("PoolFactoryMock");
    this.CorePoolV1 = <CorePoolV1Mock__factory>await ethers.getContractFactory("CorePoolV1Mock");
    this.ERC20 = <ERC20Mock__factory>await ethers.getContractFactory("ERC20Mock");
  });

  beforeEach(async function () {
    [this.signers.deployer, this.signers.alice, this.signers.bob, this.signers.carol] = await ethers.getSigners();

    this.ilv = await this.ERC20.connect(this.signers.deployer).deploy(
      "Illuvium",
      "ILV",
      ethers.utils.parseEther("10000000"),
    );
    this.silv = await this.ERC20.connect(this.signers.deployer).deploy("Escrowed Illuvium", "sILV", "0");
    this.flashToken = await this.ERC20.connect(this.signers.deployer).deploy(
      "Flash Token",
      "FLT",
      ethers.utils.parseEther("10000000"),
    );

    this.factory = (await upgrades.deployProxy(this.PoolFactory, [
      this.ilv.address,
      this.silv.address,
      ILV_PER_SECOND,
      SECONDS_PER_UPDATE,
      INIT_TIME,
      END_TIME,
    ])) as PoolFactoryMock;
    this.corePoolV1 = await this.CorePoolV1.deploy();
    this.ilvPool = (await upgrades.deployProxy(this.ILVPool, [
      this.ilv.address,
      this.silv.address,
      this.ilv.address,
      this.factory.address,
      INIT_TIME,
      ILV_POOL_WEIGHT,
      this.corePoolV1.address,
      V1_STAKE_MAX_PERIOD,
    ])) as ILVPoolMock;
    this.flashPool = (await upgrades.deployProxy(this.FlashPool, [
      this.ilv.address,
      this.silv.address,
      this.flashToken.address,
      this.factory.address,
      FLASH_INIT_TIME,
      FLASH_POOL_WEIGHT,
    ])) as FlashPoolMock;

    await this.factory.connect(this.signers.deployer).registerPool(this.ilvPool.address);
    await this.factory.connect(this.signers.deployer).registerPool(this.flashPool.address);

    // await this.ilv.connect(this.signers.deployer).transfer(await toAddress(this.signers.alice), toWei(100000));
    // await this.ilv.connect(this.signers.deployer).transfer(await toAddress(this.signers.bob), toWei(100000));
    // await this.ilv.connect(this.signers.deployer).transfer(await toAddress(this.signers.carol), toWei(100000));

    await this.flashToken.connect(this.signers.deployer).transfer(this.signers.alice.address, toWei(10000));
    await this.flashToken.connect(this.signers.deployer).transfer(this.signers.bob.address, toWei(10000));
    await this.flashToken.connect(this.signers.deployer).transfer(this.signers.carol.address, toWei(10000));
  });
  describe("#stake", function () {
    it("should stake", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(1000));

      const balance = await this.flashPool.balanceOf(this.signers.alice.address);

      expect(balance).to.be.equal(toWei(1000));
    });

    it("should revert on _value 0", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await expect(this.flashPool.connect(this.signers.alice).stake(toWei(0))).reverted;
    });
    it("should process rewards on stake", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(1000));

      await this.flashPool.setNow256(FLASH_INIT_TIME + 1);
      await this.flashPool.connect(this.signers.alice).stake(toWei(1));
      const { pendingYield } = await this.flashPool.users(this.signers.alice.address);

      const poolWeight = await this.flashPool.weight();
      const totalWeight = await this.factory.totalWeight();

      expect(ethers.utils.formatEther(pendingYield).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(ILV_PER_SECOND.mul(poolWeight).div(totalWeight)).slice(0, 6),
      );
    });
  });
  describe("#pendingYield", async function () {
    it("should not accumulate rewards before init time", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.flashPool.setNow256(1);

      const pendingYield = await this.flashPool.pendingYieldRewards(this.signers.alice.address);

      expect(pendingYield.toNumber()).to.be.equal(0);
    });
    it("should accumulate ILV correctly", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.flashPool.setNow256(FLASH_INIT_TIME + 10);

      const totalWeight = await this.factory.totalWeight();
      const poolWeight = await this.flashPool.weight();

      const expectedRewards = 10 * Number(ILV_PER_SECOND) * (poolWeight / totalWeight);

      const pendingYield = await this.flashPool.pendingYieldRewards(this.signers.alice.address);

      expect(expectedRewards).to.be.equal(Number(pendingYield));
    });
    it("should accumulate ILV correctly for multiple stakers", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.flashToken.connect(this.signers.bob).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.bob).stake(toWei(100));

      await this.flashPool.setNow256(FLASH_INIT_TIME + 10);

      const totalWeight = await this.factory.totalWeight();
      const poolWeight = await this.flashPool.weight();

      const expectedRewards = 10 * Number(ILV_PER_SECOND) * (poolWeight / totalWeight);

      const aliceYield = await this.flashPool.pendingYieldRewards(this.signers.alice.address);
      const bobYield = await this.flashPool.pendingYieldRewards(this.signers.bob.address);

      expect(Number(aliceYield)).to.be.equal(expectedRewards / 2);
      expect(Number(bobYield)).to.be.equal(expectedRewards / 2);
    });
    it("should calculate pending rewards correctly after bigger stakes", async function () {
      const poolWeight = await this.flashPool.weight();
      const totalWeight = await this.factory.totalWeight();

      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(10));

      await this.flashPool.setNow256(FLASH_INIT_TIME + 50);

      const aliceYield0 = await this.flashPool.pendingYieldRewards(this.signers.alice.address);

      const expectedAliceYield0 = ILV_PER_SECOND.mul(50).mul(poolWeight).div(totalWeight);

      await this.flashToken.connect(this.signers.bob).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.bob).stake(toWei(5000));

      const totalInPool = toWei(10 * 1e6).add(toWei(5000 * 2e6));

      const bobYield0 = await this.flashPool.pendingYieldRewards(this.signers.bob.address);

      const expectedBobYield0 = 0;

      await this.flashPool.setNow256(FLASH_INIT_TIME + 200);

      const aliceYield1 = await this.flashPool.pendingYieldRewards(this.signers.alice.address);
      const bobYield1 = await this.flashPool.pendingYieldRewards(this.signers.bob.address);

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
      const poolWeight = await this.flashPool.weight();
      const totalWeight = await this.factory.totalWeight();

      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.flashPool.setNow256(FLASH_INIT_TIME + 20);

      const expectedYield0 = ILV_PER_SECOND.mul(20).mul(poolWeight).div(totalWeight);

      const aliceYield0 = await this.flashPool.pendingYieldRewards(this.signers.alice.address);

      await this.flashPool.setNow256(END_TIME);

      const expectedYield1 = ILV_PER_SECOND.mul(END_TIME - FLASH_INIT_TIME)
        .mul(poolWeight)
        .div(totalWeight);

      const aliceYield1 = await this.flashPool.pendingYieldRewards(this.signers.alice.address);

      await this.flashPool.setNow256(END_TIME + 100);

      const aliceYield2 = await this.flashPool.pendingYieldRewards(this.signers.alice.address);

      expect(expectedYield0).to.be.equal(aliceYield0);
      expect(expectedYield1).to.be.equal(aliceYield1);
      expect(expectedYield1).to.be.equal(aliceYield2);
    });
  });
});
