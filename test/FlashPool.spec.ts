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
  toAddress,
} from "./utils";
import {
  stakeAndLock,
  stakeFlexible,
  pendingYield,
  claimYieldRewards,
  claimYieldRewardsMultiple,
  unstakeFlexible,
  unstakeLocked,
} from "./CorePool.behavior";
import { FlashPool__factory } from "../typechain";

chai.use(solidity);
chai.use(chaiSubset);

describe("FlashPool", function () {
  before(async function () {
    this.signers = {} as Signers;

    this.ILVPool = <ILVPoolMock__factory>await ethers.getContractFactory("ILVPoolMock");
    this.FlashPool = <FlashPoolMock__factory>await ethers.getContractFactory("FlashPool");
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
    await this.factory.connect(this.signers.deployer).registerPool(this.lpPool.address);

    await this.ilv.connect(this.signers.deployer).transfer(await toAddress(this.signers.alice), toWei(100000));
    await this.ilv.connect(this.signers.deployer).transfer(await toAddress(this.signers.bob), toWei(100000));
    await this.ilv.connect(this.signers.deployer).transfer(await toAddress(this.signers.carol), toWei(100000));

    await this.lp.connect(this.signers.deployer).transfer(await toAddress(this.signers.alice), toWei(10000));
    await this.lp.connect(this.signers.deployer).transfer(await toAddress(this.signers.bob), toWei(10000));
    await this.lp.connect(this.signers.deployer).transfer(await toAddress(this.signers.carol), toWei(10000));
  });
  describe("#stakeAndLock", function () {
    context("ILV Pool", stakeAndLock("ILV"));
    context("Sushi LP Pool", stakeAndLock("LP"));
  });
  describe("#stakeFlexible", function () {
    context("ILV Pool", stakeFlexible("ILV"));
    context("Sushi LP Pool", stakeFlexible("LP"));
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
  describe("#unstakeFlexible", function () {
    context("ILV Pool", unstakeFlexible("ILV"));
    context("Sushi LP Pool", unstakeFlexible("LP"));
  });
});
