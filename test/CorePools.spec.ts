import chai from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";
import { ethers, upgrades } from "hardhat";
import { ContractFactory, Signer, Contract } from "ethers";

chai.use(solidity);
chai.use(chaiSubset);

const { expect } = chai;

let ILVPool: ContractFactory;
let SushiLPPool: ContractFactory;
let PoolFactory: ContractFactory;

describe("CorePools", () => {
  let deployer: Signer;
  let accounts: Signer[];

  let ilv: Contract;
  let silv: Contract;
  let factory: Contract;
  let ilvPool: Contract;
  let lpPool: Contract;

  before(async () => {
    ILVPool = await ethers.getContractFactory("ILVPool");
    SushiLPPool = await ethers.getContractFactory("SushiLPPool");
    PoolFactory = await ethers.getContractFactory("PoolFactory");
  });

  beforeEach(async () => {
    [deployer, ...signers] = await ethers.getSigners();

    ilvPool = upgrades.deployProxy(ILVPool);
    lpPool = upgrades.deployProxy(SushiLPPool);
    factory = upgrades.deployProxy(PoolFactory);
  });
});
