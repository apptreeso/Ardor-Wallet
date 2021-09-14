import chai from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";
import { ethers, upgrades } from "hardhat";
import { Signer, Contract } from "ethers";
import { ILVPool__factory, SushiLPPool__factory, PoolFactory__factory } from "../types";

chai.use(solidity);
chai.use(chaiSubset);

const { expect } = chai;

let ILVPool: ILVPool__factory;
let SushiLPPool: SushiLPPool__factory;
let PoolFactory: PoolFactory__factory;

describe("CorePools", () => {
  let deployer: Signer;
  let accounts: Signer[];

  let ilv: Contract;
  let silv: Contract;
  let factory: Contract;
  let ilvPool: Contract;
  let lpPool: Contract;

  before(async () => {
    ILVPool = <ILVPool__factory>await ethers.getContractFactory("ILVPoolMock");
    SushiLPPool = await ethers.getContractFactory("SushiLPPoolMock");
    PoolFactory = await ethers.getContractFactory("PoolFactoryMock");
  });

  beforeEach(async () => {
    [deployer, ...signers] = await ethers.getSigners();

    ilvPool = upgrades.deployProxy(ILVPool);
    lpPool = upgrades.deployProxy(SushiLPPool);
    factory = upgrades.deployProxy(PoolFactory);
  });
});
