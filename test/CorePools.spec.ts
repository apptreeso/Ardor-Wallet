import chai from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";
import { ethers, upgrades } from "hardhat";
import { Signer } from "ethers";
import {
  ILVPoolMock__factory,
  ILVPoolMock,
  SushiLPPoolMock__factory,
  SushiLPPoolMock,
  PoolFactoryMock__factory,
  PoolFactoryMock,
  ERC20Mock__factory,
  ERC20Mock,
} from "../types";

import {
  ILV_PER_SECOND,
  SECONDS_PER_UPDATE,
  INIT_TIME,
  END_TIME,
  ILV_POOL_WEIGHT,
  LP_POOL_WEIGHT,
  V1_STAKE_MAX_PERIOD,
} from "./utils";

chai.use(solidity);
chai.use(chaiSubset);

const { expect } = chai;

let ILVPool: ILVPoolMock__factory;
let SushiLPPool: SushiLPPoolMock__factory;
let PoolFactory: PoolFactoryMock__factory;
let ERC20: ERC20Mock__factory;

describe("CorePools", () => {
  let deployer: Signer;
  let accounts: Signer[];

  let ilv: ERC20Mock;
  let silv: ERC20Mock;
  let factory: PoolFactoryMock;
  let ilvPool: ILVPoolMock;
  let lpPool: SushiLPPoolMock;

  before(async () => {
    ILVPool = <ILVPoolMock__factory>await ethers.getContractFactory("ILVPoolMock");
    SushiLPPool = <SushiLPPoolMock__factory>await ethers.getContractFactory("SushiLPPoolMock");
    PoolFactory = <PoolFactoryMock__factory>await ethers.getContractFactory("PoolFactoryMock");
    ERC20 = <ERC20Mock__factory>await ethers.getContractFactory("ERC20Mock");
  });

  beforeEach(async () => {
    [deployer, ...accounts] = await ethers.getSigners();

    ilv = await ERC20.connect(deployer).deploy("Illuvium", "ILV", ethers.utils.parseEther("10000000"));
    silv = await ERC20.connect(deployer).deploy("Escrowed Illuvium", "sILV", "0");

    factory = (await upgrades.deployProxy(PoolFactory, [
      ilv.address,
      silv.address,
      ILV_PER_SECOND,
      SECONDS_PER_UPDATE,
      INIT_TIME,
      END_TIME,
    ])) as PoolFactoryMock;
    ilvPool = (await upgrades.deployProxy(ILVPool, [
      ilv.address,
      silv.address,
      ilv.address,
      factory.address,
      INIT_TIME,
      ILV_POOL_WEIGHT,
      ethers.constants.AddressZero,
      V1_STAKE_MAX_PERIOD,
    ])) as ILVPoolMock;
    lpPool = (await upgrades.deployProxy(SushiLPPool, [
      ilv.address,
      silv.address,
      ilv.address,
      factory.address,
      INIT_TIME,
      ILV_POOL_WEIGHT,
      ethers.constants.AddressZero,
      V1_STAKE_MAX_PERIOD,
    ])) as SushiLPPoolMock;
  });

  it("should work", () => {
    console.log(factory.address, ilvPool.address, lpPool.address);
  });
});
