import chai from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";
import { ethers, upgrades } from "hardhat";
import {
  ILVPoolMock__factory,
  ILVPoolMock,
  FlashPoolMock__factory,
  FlashPoolUpgrade__factory,
  FlashPoolMock,
  FlashPoolUpgrade,
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
  ONE_YEAR,
} from "./utils";

const { MaxUint256, AddressZero } = ethers.constants;

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

    this.FlashPoolUpgrade = <FlashPoolUpgrade__factory>await ethers.getContractFactory("FlashPoolUpgrade");
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

    this.factory = (await upgrades.deployProxy(
      this.PoolFactory,
      [this.ilv.address, this.silv.address, ILV_PER_SECOND, SECONDS_PER_UPDATE, INIT_TIME, END_TIME],
      { kind: "uups" },
    )) as PoolFactoryMock;
    this.corePoolV1 = await this.CorePoolV1.connect(this.signers.deployer).deploy(this.ilv.address);
    this.ilvPool = (await upgrades.deployProxy(
      this.ILVPool,
      [
        this.ilv.address,
        this.silv.address,
        this.ilv.address,
        this.factory.address,
        INIT_TIME,
        ILV_POOL_WEIGHT,
        this.corePoolV1.address,
        V1_STAKE_MAX_PERIOD,
      ],
      { kind: "uups" },
    )) as ILVPoolMock;
    this.flashPool = (await upgrades.deployProxy(
      this.FlashPool,
      [
        this.ilv.address,
        this.silv.address,
        this.flashToken.address,
        this.factory.address,
        FLASH_INIT_TIME,
        FLASH_POOL_WEIGHT,
      ],
      { kind: "uups" },
    )) as FlashPoolMock;

    await this.factory.connect(this.signers.deployer).registerPool(this.ilvPool.address);
    await this.factory.connect(this.signers.deployer).registerPool(this.flashPool.address);

    await this.ilv.connect(this.signers.deployer).transfer(this.signers.alice.address, toWei(100000));
    await this.ilv.connect(this.signers.deployer).transfer(this.signers.bob.address, toWei(100000));
    await this.ilv.connect(this.signers.deployer).transfer(this.signers.carol.address, toWei(100000));

    await this.flashToken.connect(this.signers.deployer).transfer(this.signers.alice.address, toWei(10000));
    await this.flashToken.connect(this.signers.deployer).transfer(this.signers.bob.address, toWei(10000));
    await this.flashToken.connect(this.signers.deployer).transfer(this.signers.carol.address, toWei(10000));
  });
  describe("Upgrades", function () {
    it("should upgrade flash pool", async function () {
      const prevPoolAddress = this.flashPool.address;
      this.flashPool = (await upgrades.upgradeProxy(this.flashPool.address, this.FlashPoolUpgrade)) as FlashPoolUpgrade;
      const newPoolAddress = this.flashPool.address;

      expect(await (this.flashPool as FlashPoolUpgrade).newFunction(1, 2)).to.be.equal(3);
      expect(prevPoolAddress).to.be.equal(newPoolAddress);
    });
    it("should revert deploying a pool if factory == address(0)", async function () {
      await expect(
        upgrades.deployProxy(
          this.FlashPool,
          [
            this.ilv.address,
            this.silv.address,
            this.flashToken.address,
            AddressZero,
            FLASH_INIT_TIME,
            FLASH_POOL_WEIGHT,
          ],
          { kind: "uups" },
        ),
      ).reverted;
    });
    it("should revert initializing a factory if _ilv == address(0)", async function () {
      await expect(
        upgrades.deployProxy(
          this.PoolFactory,
          [AddressZero, this.silv.address, ILV_PER_SECOND, SECONDS_PER_UPDATE, INIT_TIME, END_TIME],
          { kind: "uups" },
        ),
      ).reverted;
    });
    it("should revert initializing a factory if _silv == address(0)", async function () {
      await expect(
        upgrades.deployProxy(
          this.PoolFactory,
          [this.ilv.address, AddressZero, ILV_PER_SECOND, SECONDS_PER_UPDATE, INIT_TIME, END_TIME],
          { kind: "uups" },
        ),
      ).reverted;
    });
    it("should revert initializing a factory if _ilvPerSecond == 0", async function () {
      await expect(
        upgrades.deployProxy(
          this.PoolFactory,
          [this.ilv.address, this.silv.address, 0, SECONDS_PER_UPDATE, INIT_TIME, END_TIME],
          { kind: "uups" },
        ),
      ).reverted;
    });
    it("should revert initializing a factory if _secondsPerUpdate == 0", async function () {
      await expect(
        upgrades.deployProxy(
          this.PoolFactory,
          [this.ilv.address, this.silv.address, ILV_PER_SECOND, 0, INIT_TIME, END_TIME],
          { kind: "uups" },
        ),
      ).reverted;
    });
    it("should revert initializing a factory if _initTime == 0", async function () {
      await expect(
        upgrades.deployProxy(
          this.PoolFactory,
          [this.ilv.address, this.silv.address, ILV_PER_SECOND, SECONDS_PER_UPDATE, 0, END_TIME],
          { kind: "uups" },
        ),
      ).reverted;
    });
    it("should revert initializing a factory if _endTime == 0", async function () {
      await expect(
        upgrades.deployProxy(
          this.PoolFactory,
          [this.ilv.address, this.silv.address, ILV_PER_SECOND, SECONDS_PER_UPDATE, INIT_TIME, 0],
          { kind: "uups" },
        ),
      ).reverted;
    });
  });
  describe("#getPoolData", function () {
    it("should get correct pool data", async function () {
      const poolWeight = await this.flashPool.weight();

      const poolData = await this.factory.getPoolData(this.flashToken.address);

      expect(poolData.poolToken).to.be.equal(this.flashToken.address);
      expect(poolData.poolAddress).to.be.equal(this.flashPool.address);
      expect(poolData.weight).to.be.equal(poolWeight);
      expect(poolData.isFlashPool).to.be.equal(true);
    });
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
  describe("#pendingYield", function () {
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

      expect(ethers.utils.formatEther(expectedRewards.toString()).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(pendingYield).slice(0, 6),
      );
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

      expect(ethers.utils.formatEther(aliceYield).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther((expectedRewards / 2).toString()).slice(0, 6),
      );
      expect(ethers.utils.formatEther(bobYield).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther((expectedRewards / 2).toString()).slice(0, 6),
      );
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

      const totalInPool = toWei(10).add(toWei(5000));

      const bobYield0 = await this.flashPool.pendingYieldRewards(this.signers.bob.address);

      const expectedBobYield0 = 0;

      await this.flashPool.setNow256(FLASH_INIT_TIME + 200);

      const aliceYield1 = await this.flashPool.pendingYieldRewards(this.signers.alice.address);
      const bobYield1 = await this.flashPool.pendingYieldRewards(this.signers.bob.address);

      const expectedAliceYield1 = ILV_PER_SECOND.mul(150)
        .mul(toWei(10))
        .div(totalInPool)
        .mul(poolWeight)
        .div(totalWeight)
        .add(expectedAliceYield0);

      const expectedBobYield1 = ILV_PER_SECOND.mul(150)
        .mul(toWei(5000))
        .div(totalInPool)
        .mul(poolWeight)
        .div(totalWeight);

      expect(ethers.utils.formatEther(expectedAliceYield0).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(aliceYield0).slice(0, 6),
      );
      expect(ethers.utils.formatEther(expectedAliceYield1).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(aliceYield1).slice(0, 6),
      );
      expect(ethers.utils.formatEther(expectedBobYield0).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(bobYield0).slice(0, 6),
      );
      expect(ethers.utils.formatEther(expectedBobYield1).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(bobYield1).slice(0, 6),
      );
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

      expect(ethers.utils.formatEther(expectedYield0).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(aliceYield0).slice(0, 6),
      );
      expect(ethers.utils.formatEther(expectedYield1).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(aliceYield1).slice(0, 6),
      );
      expect(ethers.utils.formatEther(expectedYield1).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(aliceYield2).slice(0, 6),
      );
    });
  });
  describe("#claimYieldRewards", function () {
    it("should create ILV stake correctly", async function () {
      const poolWeight = await this.flashPool.weight();
      const totalWeight = await this.factory.totalWeight();

      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.flashPool.setNow256(FLASH_INIT_TIME + 100);

      await this.flashPool.connect(this.signers.alice).claimYieldRewards(false);

      const expectedCompoundedYield = ILV_PER_SECOND.mul(100).mul(poolWeight).div(totalWeight);

      const yieldStake = await this.ilvPool.getStake(this.signers.alice.address, 0);

      expect(ethers.utils.formatEther(expectedCompoundedYield).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(yieldStake.value).slice(0, 6),
      );
    });
    it("should mint sILV correctly", async function () {
      const poolWeight = await this.flashPool.weight();
      const totalWeight = await this.factory.totalWeight();

      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.flashPool.setNow256(FLASH_INIT_TIME + 100);

      await this.flashPool.connect(this.signers.alice).claimYieldRewards(true);

      const expectedMintedYield = ILV_PER_SECOND.mul(100).mul(poolWeight).div(totalWeight);

      const sILVBalance = await this.silv.balanceOf(this.signers.alice.address);

      expect(ethers.utils.formatEther(sILVBalance).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(expectedMintedYield).slice(0, 6),
      );
    });
  });
  describe("#claimYieldRewardsMultiple", function () {
    it("should correctly claim multiple pools as ILV", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.alice).stake(toWei(100), ONE_YEAR * 2);

      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.ilvPool.setNow256(FLASH_INIT_TIME + 1000);
      await this.flashPool.setNow256(FLASH_INIT_TIME + 1000);

      const { pendingYield: ilvPoolPendingYield } = await this.ilvPool.pendingRewards(this.signers.alice.address);
      const flashPoolPendingYield = await this.flashPool.pendingYieldRewards(this.signers.alice.address);

      await this.ilvPool
        .connect(this.signers.alice)
        .claimYieldRewardsMultiple([this.ilvPool.address, this.flashPool.address], [false, false]);

      const { value: ilvPoolYield } = await this.ilvPool.getStake(this.signers.alice.address, 1);
      const { value: flashPoolYield } = await this.ilvPool.getStake(this.signers.alice.address, 2);

      expect(ilvPoolYield).to.be.equal(ilvPoolPendingYield);
      expect(flashPoolYield).to.be.equal(flashPoolPendingYield);
    });
    it("should correctly claim multiple pools as sILV", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.alice).stake(toWei(100), ONE_YEAR * 2);

      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.ilvPool.setNow256(FLASH_INIT_TIME + 1000);
      await this.flashPool.setNow256(FLASH_INIT_TIME + 1000);

      const { pendingYield: ilvPoolPendingYield } = await this.ilvPool.pendingRewards(this.signers.alice.address);
      const flashPoolPendingYield = await this.flashPool.pendingYieldRewards(this.signers.alice.address);

      await this.ilvPool
        .connect(this.signers.alice)
        .claimYieldRewardsMultiple([this.ilvPool.address, this.flashPool.address], [true, true]);

      const sILVBalance = await this.silv.balanceOf(this.signers.alice.address);
      const totalYield = ilvPoolPendingYield.add(flashPoolPendingYield);

      expect(sILVBalance).to.be.equal(totalYield);
    });
    it("should correctly claim multiple pools as ILV and sILV", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.alice).stake(toWei(100), ONE_YEAR * 2);

      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.ilvPool.setNow256(FLASH_INIT_TIME + 1000);
      await this.flashPool.setNow256(FLASH_INIT_TIME + 1000);

      const { pendingYield: ilvPoolPendingYield } = await this.ilvPool.pendingRewards(this.signers.alice.address);
      const flashPoolPendingYield = await this.flashPool.pendingYieldRewards(this.signers.alice.address);

      await this.ilvPool
        .connect(this.signers.alice)
        .claimYieldRewardsMultiple([this.ilvPool.address, this.flashPool.address], [false, true]);

      const { value: compoundedIlvYield } = await this.ilvPool.getStake(this.signers.alice.address, 1);
      const sILVBalance = await this.silv.balanceOf(this.signers.alice.address);

      expect(compoundedIlvYield).to.be.equal(ilvPoolPendingYield);
      expect(sILVBalance).to.be.equal(flashPoolPendingYield);
    });
    it("should revert if claiming invalid pool", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.alice).stake(toWei(100), ONE_YEAR * 2);

      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.ilvPool.setNow256(FLASH_INIT_TIME + 1000);
      await this.flashPool.setNow256(FLASH_INIT_TIME + 1000);

      await expect(
        this.ilvPool
          .connect(this.signers.alice)
          .claimYieldRewardsMultiple([this.ilvPool.address, this.signers.bob.address], [false, true]),
      ).reverted;
    });
    it("should revert if claiming from invalid address", async function () {
      await this.ilv.connect(this.signers.alice).approve(this.ilvPool.address, MaxUint256);
      await this.ilvPool.connect(this.signers.alice).stake(toWei(100), ONE_YEAR * 2);

      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.ilvPool.setNow256(FLASH_INIT_TIME + 1000);
      await this.flashPool.setNow256(FLASH_INIT_TIME + 1000);

      await expect(
        this.flashPool.connect(this.signers.alice).claimYieldRewardsFromRouter(this.signers.alice.address, false),
      ).reverted;
    });
  });
  describe("#unstake", function () {
    it("should unstake", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(1000));

      await this.flashPool.connect(this.signers.alice).unstake(toWei(1000));

      const poolBalance = await this.flashPool.balanceOf(this.signers.alice.address);

      expect(poolBalance.toNumber()).to.be.equal(0);
    });
    it("should revert unstaking 0", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(1000));

      await expect(this.flashPool.connect(this.signers.alice).unstake(0)).reverted;
    });
    it("should revert unstaking more than allowed", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(1000));

      await expect(this.flashPool.connect(this.signers.alice).unstake(toWei(1001))).reverted;
    });
    it("should process rewards on unstake", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(1000));

      await this.flashPool.setNow256(FLASH_INIT_TIME + 1);
      await this.flashPool.connect(this.signers.alice).unstake(toWei(1));
      const { pendingYield } = await this.flashPool.users(this.signers.alice.address);

      const poolWeight = await this.flashPool.weight();
      const totalWeight = await this.factory.totalWeight();

      expect(ethers.utils.formatEther(pendingYield).slice(0, 6)).to.be.equal(
        ethers.utils.formatEther(ILV_PER_SECOND.mul(poolWeight).div(totalWeight)).slice(0, 6),
      );
    });
  });
  describe("#setWeight", function () {
    it("should change pool weight", async function () {
      await this.factory.changePoolWeight(this.flashPool.address, ethers.BigNumber.from(50));
    });
    it("should revert on invalid setWeight caller", async function () {
      await expect(this.flashPool.setWeight(ethers.BigNumber.from(50))).reverted;
    });
  });
  describe("#sync", function () {
    it("should sync pool state", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.flashPool.setNow256(FLASH_INIT_TIME + 10);
      await this.flashPool.sync();

      const poolWeight = await this.flashPool.weight();
      const totalWeight = await this.factory.totalWeight();

      const lastYieldDistribution = await this.flashPool.lastYieldDistribution();
      const yieldRewardsPerToken = await this.flashPool.yieldRewardsPerToken();

      const expectedLastYieldDistribution = ethers.BigNumber.from(FLASH_INIT_TIME + 10);
      const expectedYieldRewardsPerToken = ILV_PER_SECOND.mul(10)
        .mul(poolWeight)
        .mul(toWei(1))
        .div(totalWeight)
        .div(toWei(100));

      expect(expectedLastYieldDistribution).to.be.equal(lastYieldDistribution);
      expect(expectedYieldRewardsPerToken).to.be.equal(yieldRewardsPerToken);
    });
    it("should sync pool state with totalStaked = 0", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);

      await this.flashPool.setNow256(FLASH_INIT_TIME + 10);
      await this.flashPool.sync();

      const lastYieldDistribution = await this.flashPool.lastYieldDistribution();
      const yieldRewardsPerToken = await this.flashPool.yieldRewardsPerToken();

      const expectedLastYieldDistribution = ethers.BigNumber.from(FLASH_INIT_TIME + 10);
      const expectedYieldRewardsPerToken = 0;

      expect(expectedLastYieldDistribution).to.be.equal(lastYieldDistribution);
      expect(expectedYieldRewardsPerToken).to.be.equal(yieldRewardsPerToken);
    });
    it("should stop sync after endTime", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.flashPool.setNow256(END_TIME + 100);
      await this.flashPool.sync();
      await this.flashPool.setNow256(END_TIME + 200);
      await this.flashPool.sync();

      const poolWeight = await this.flashPool.weight();
      const totalWeight = await this.factory.totalWeight();

      const lastYieldDistribution = await this.flashPool.lastYieldDistribution();
      const yieldRewardsPerToken = await this.flashPool.yieldRewardsPerToken();

      const expectedLastYieldDistribution = ethers.BigNumber.from(END_TIME);
      const expectedYieldRewardsPerToken = ILV_PER_SECOND.mul(END_TIME - FLASH_INIT_TIME)
        .mul(poolWeight)
        .mul(toWei(1))
        .div(totalWeight)
        .div(toWei(100));

      expect(expectedLastYieldDistribution).to.be.equal(lastYieldDistribution);
      expect(expectedYieldRewardsPerToken).to.be.equal(yieldRewardsPerToken);
    });
    it("should update ilv per second after secondsPerUpdate", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.flashPool.setNow256(END_TIME - 100);
      await this.factory.setNow256(END_TIME - 100);

      const ilvPerSecond = await this.factory.ilvPerSecond();

      await this.flashPool.sync();

      const newIlvPerSecond = await this.factory.ilvPerSecond();
      const lastRatioUpdate = await this.factory.lastRatioUpdate();
      const expectedIlvPerSecond = ilvPerSecond.mul(97).div(100);
      const expectedLastRatioUpdate = END_TIME - 100;

      expect(expectedIlvPerSecond).to.be.equal(newIlvPerSecond);
      expect(expectedLastRatioUpdate).to.be.equal(lastRatioUpdate);
    });
  });
  describe("#migrateUser", function () {
    it("should migrate an user stake", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.flashPool.setNow256(INIT_TIME + 100);

      await this.flashPool.connect(this.signers.alice).claimYieldRewards(false);

      await this.flashPool.setNow256(INIT_TIME + 200);

      const {
        pendingYield: pendingYield0,
        balance: balance0,
        subYieldRewards: subYieldRewards0,
      } = await this.flashPool.users(this.signers.alice.address);

      await this.flashPool.connect(this.signers.alice).migrateUser(this.signers.bob.address);

      const {
        pendingYield: pendingYield1,
        balance: balance1,
        subYieldRewards: subYieldRewards1,
      } = await this.flashPool.users(this.signers.bob.address);

      expect(pendingYield0).to.be.equal(pendingYield1);
      expect(balance0).to.be.equal(balance1);
      expect(subYieldRewards0).to.be.equal(subYieldRewards1);
    });
    it("should revert if _to = address(0)", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.flashPool.setNow256(INIT_TIME + 100);

      await this.flashPool.connect(this.signers.alice).claimYieldRewards(false);

      await this.flashPool.setNow256(INIT_TIME + 200);

      await expect(this.flashPool.connect(this.signers.alice).migrateUser(AddressZero)).reverted;
    });
    it("should revert if newUser totalWeight = 0", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.flashPool.setNow256(INIT_TIME + 100);

      await this.flashPool.connect(this.signers.alice).claimYieldRewards(false);

      await this.flashPool.setNow256(INIT_TIME + 200);

      await this.flashToken.connect(this.signers.bob).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.bob).stake(toWei(100));

      await expect(this.flashPool.connect(this.signers.alice).migrateUser(this.signers.bob.address)).reverted;
    });

    it("should revert if newUser pendingYield = 0", async function () {
      await this.flashToken.connect(this.signers.alice).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.alice).stake(toWei(100));

      await this.flashPool.setNow256(INIT_TIME + 100);

      await this.flashPool.connect(this.signers.alice).claimYieldRewards(false);

      await this.flashPool.setNow256(INIT_TIME + 200);

      await this.flashToken.connect(this.signers.bob).approve(this.flashPool.address, MaxUint256);
      await this.flashPool.connect(this.signers.bob).stake(toWei(100));

      await this.flashPool.connect(this.signers.bob).claimYieldRewards(false);

      await expect(this.flashPool.connect(this.signers.alice).migrateUser(this.signers.bob.address)).reverted;
    });
  });
});
