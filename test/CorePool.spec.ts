import chai from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";
import { ethers, upgrades } from "hardhat";
import {
  ILVPoolMock__factory,
  ILVPoolUpgrade__factory,
  ILVPoolMock,
  SushiLPPoolMock__factory,
  SushiLPPoolUpgrade__factory,
  SushiLPPoolMock,
  PoolFactoryMock__factory,
  PoolFactoryUpgrade__factory,
  PoolFactoryMock,
  CorePoolV1Mock__factory,
  ERC20Mock__factory,
  Signers,
} from "../types";

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
} from "./utils";
import {
  upgradePools,
  setWeight,
  setEndTime,
  getPoolData,
  migrationTests,
  mintV1Yield,
  updateStakeLock,
  stake,
  sync,
  pendingYield,
  claimYieldRewards,
  claimYieldRewardsMultiple,
  unstakeLocked,
  unstakeLockedMultiple,
  migrateUser,
} from "./CorePool.behavior";

chai.use(solidity);
chai.use(chaiSubset);

describe("CorePools", function () {
  before(async function () {
    this.signers = {} as Signers;
    this.ILVPool = <ILVPoolMock__factory>await ethers.getContractFactory("ILVPoolMock");
    this.SushiLPPool = <SushiLPPoolMock__factory>await ethers.getContractFactory("SushiLPPoolMock");
    this.PoolFactory = <PoolFactoryMock__factory>await ethers.getContractFactory("PoolFactoryMock");
    this.CorePoolV1 = <CorePoolV1Mock__factory>await ethers.getContractFactory("CorePoolV1Mock");
    this.ERC20 = <ERC20Mock__factory>await ethers.getContractFactory("ERC20Mock");

    // upgrades factories
    this.ILVPoolUpgrade = <ILVPoolUpgrade__factory>await ethers.getContractFactory("ILVPoolUpgrade");
    this.SushiLPPoolUpgrade = <SushiLPPoolUpgrade__factory>await ethers.getContractFactory("SushiLPPoolUpgrade");
    this.PoolFactoryUpgrade = <PoolFactoryUpgrade__factory>await ethers.getContractFactory("PoolFactoryUpgrade");
  });

  beforeEach(async function () {
    [this.signers.deployer, this.signers.alice, this.signers.bob, this.signers.carol] = await ethers.getSigners();

    this.ilv = await this.ERC20.connect(this.signers.deployer).deploy(
      "Illuvium",
      "ILV",
      ethers.utils.parseEther("10000000"),
    );
    this.silv = await this.ERC20.connect(this.signers.deployer).deploy("Escrowed Illuvium", "sILV", "0");
    this.lp = await this.ERC20.connect(this.signers.deployer).deploy(
      "Sushiswap ILV/ETH LP",
      "SLP",
      ethers.utils.parseEther("100000"),
    );

    this.factory = (await upgrades.deployProxy(
      this.PoolFactory,
      [this.ilv.address, this.silv.address, ILV_PER_SECOND, SECONDS_PER_UPDATE, INIT_TIME, END_TIME],
      { kind: "uups" },
    )) as PoolFactoryMock;

    this.ilvPoolV1 = await this.CorePoolV1.connect(this.signers.deployer).deploy(this.ilv.address);
    this.lpPoolV1 = await this.CorePoolV1.connect(this.signers.deployer).deploy(this.lp.address);

    this.ilvPool = (await upgrades.deployProxy(
      this.ILVPool,
      [
        this.ilv.address,
        this.silv.address,
        this.ilv.address,
        this.factory.address,
        INIT_TIME,
        ILV_POOL_WEIGHT,
        this.ilvPoolV1.address,
        V1_STAKE_MAX_PERIOD,
      ],
      { kind: "uups" },
    )) as ILVPoolMock;

    this.lpPool = (await upgrades.deployProxy(
      this.SushiLPPool,
      [
        this.ilv.address,
        this.silv.address,
        this.lp.address,
        this.factory.address,
        INIT_TIME,
        LP_POOL_WEIGHT,
        this.lpPoolV1.address,
        V1_STAKE_MAX_PERIOD,
      ],
      { kind: "uups" },
    )) as SushiLPPoolMock;
    await this.factory.connect(this.signers.deployer).registerPool(this.ilvPool.address);
    await this.factory.connect(this.signers.deployer).registerPool(this.lpPool.address);

    await this.ilv.connect(this.signers.deployer).transfer(await toAddress(this.signers.alice), toWei(100000));
    await this.ilv.connect(this.signers.deployer).transfer(await toAddress(this.signers.bob), toWei(100000));
    await this.ilv.connect(this.signers.deployer).transfer(await toAddress(this.signers.carol), toWei(100000));

    await this.lp.connect(this.signers.deployer).transfer(await toAddress(this.signers.alice), toWei(10000));
    await this.lp.connect(this.signers.deployer).transfer(await toAddress(this.signers.bob), toWei(10000));
    await this.lp.connect(this.signers.deployer).transfer(await toAddress(this.signers.carol), toWei(10000));
  });
  describe("Upgrades", upgradePools());
  describe("#setEndTime", setEndTime());
  describe("#getPoolData", function () {
    context("ILV Pool", getPoolData("ILV"));
    context("Sushi LP Pool", getPoolData("LP"));
  });
  describe("#stake", function () {
    context("ILV Pool", stake("ILV"));
    context("Sushi LP Pool", stake("LP"));
  });
  describe("#pendingYield", function () {
    context("ILV Pool", pendingYield("ILV"));
    context("Sushi LP Pool", pendingYield("LP"));
  });
  describe("#claimYieldRewards", function () {
    context("ILV Pool", claimYieldRewards("ILV"));
    context("Sushi LP Pool", claimYieldRewards("LP"));
  });
  describe("#claimYieldRewardsMultiple", claimYieldRewardsMultiple());
  describe("#unstakeLocked", function () {
    context("ILV Pool", unstakeLocked("ILV"));
    context("Sushi LP Pool", unstakeLocked("LP"));
  });
  describe("#sync", function () {
    context("ILV Pool", sync("ILV"));
    context("Sushi LP Pool", sync("LP"));
  });
  describe("#updateStakeLock", function () {
    context("ILV Pool", updateStakeLock("ILV"));
    context("Sushi LP Pool", updateStakeLock("LP"));
  });
  describe("#setWeight", function () {
    context("ILV Pool", setWeight("ILV"));
    context("Sushi LP Pool", setWeight("LP"));
  });
  describe("#migrateUser", function () {
    context("ILV Pool", migrateUser("ILV"));
    context("Sushi LP Pool", migrateUser("LP"));
  });
  describe("#unstakeLockedMultiple", function () {
    context("ILV Pool", unstakeLockedMultiple("ILV"));
    context("Sushi LP Pool", unstakeLockedMultiple("LP"));
  });
  describe("Migration tests", function () {
    context("ILV Pool", migrationTests("ILV"));
    context("Sushi LP Pool", migrationTests("LP"));
    context("Mint yield", mintV1Yield());
  });
});
