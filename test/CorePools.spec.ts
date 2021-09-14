import chai from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";
import { ethers, upgrades } from "hardhat";
import { Signer, Contract } from "ethers";
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
    SushiLPPool = <SushiLPPoolMock>await ethers.getContractFactory("SushiLPPoolMock");
    PoolFactory = <PoolFactoryMock>await ethers.getContractFactory("PoolFactoryMock");
  });

  beforeEach(async () => {
    [deployer, ...signers] = await ethers.getSigners();

    ilv = await ERC20.connect(deployer).deploy("Illuvium", "ILV", ethers.utils.parseEther("10000000"));
    silv = await ERC20.connect(deployer).deploy("Escrowed Illuvium", "sILV", "0");

    ilvPool = await upgrades.deployProxy(ILVPool);
    lpPool = await upgrades.deployProxy(SushiLPPool);
    factory = await upgrades.deployProxy(PoolFactory);
  });
});
