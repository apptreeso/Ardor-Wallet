import chai from "chai";
import chaiSubset from "chai-subset";
import { solidity } from "ethereum-waffle";
import { ethers, upgrades } from "hardhat";
import { abi as factoryAbi, bytecode as factoryBytecode } from "@uniswap/v2-core/build/UniswapV2Factory.json";
import { abi as routerAbi, bytecode as routerBytecode } from "@uniswap/v2-periphery/build/UniswapV2Router02.json";
import {
  ILVPoolMock__factory,
  ILVPoolMock,
  SushiLPPoolMock__factory,
  SushiLPPoolMock,
  PoolFactoryMock__factory,
  PoolFactoryMock,
  CorePoolV1Mock__factory,
  ERC20Mock__factory,
  Vault__factory,
  WETHMock__factory,
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
import { setCorePools, swapETHForILV, sendILVRewards } from "./Vault.behavior";

const { MaxUint256 } = ethers.constants;

chai.use(solidity);
chai.use(chaiSubset);

describe("Vault", function () {
  before(async function () {
    this.signers = {} as Signers;
    this.ILVPool = <ILVPoolMock__factory>await ethers.getContractFactory("ILVPoolMock");
    this.SushiLPPool = <SushiLPPoolMock__factory>await ethers.getContractFactory("SushiLPPoolMock");
    this.PoolFactory = <PoolFactoryMock__factory>await ethers.getContractFactory("PoolFactoryMock");
    this.CorePoolV1 = <CorePoolV1Mock__factory>await ethers.getContractFactory("CorePoolV1Mock");
    this.ERC20 = <ERC20Mock__factory>await ethers.getContractFactory("ERC20Mock");
    this.Vault = <Vault__factory>await ethers.getContractFactory("Vault");
    this.SushiFactory = await ethers.getContractFactory(factoryAbi, factoryBytecode);
    this.SushiRouter = await ethers.getContractFactory(routerAbi, routerBytecode);
    this.WETH = <WETHMock__factory>await ethers.getContractFactory("WETHMock");
  });

  beforeEach(async function () {
    [this.signers.deployer, this.signers.alice, this.signers.bob, this.signers.carol] = await ethers.getSigners();
    await ethers.provider.send("hardhat_setBalance", [
      this.signers.deployer.address,
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    ]);

    this.ilv = await this.ERC20.connect(this.signers.deployer).deploy(
      "Illuvium",
      "ILV",
      ethers.utils.parseEther("10000000"),
    );
    this.silv = await this.ERC20.connect(this.signers.deployer).deploy("Escrowed Illuvium", "sILV", "0");

    this.factory = (await upgrades.deployProxy(
      this.PoolFactory,
      [this.ilv.address, this.silv.address, ILV_PER_SECOND, SECONDS_PER_UPDATE, INIT_TIME, END_TIME],
      { kind: "uups" },
    )) as PoolFactoryMock;
    this.ilvPoolV1 = await this.CorePoolV1.connect(this.signers.deployer).deploy(this.ilv.address);

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

    this.weth = await this.WETH.connect(this.signers.deployer).deploy();
    this.sushiFactory = await this.SushiFactory.connect(this.signers.deployer).deploy(this.signers.deployer.address);
    this.sushiRouter = await this.SushiRouter.connect(this.signers.deployer).deploy(
      this.sushiFactory.address,
      this.weth.address,
    );
    this.vault = await this.Vault.connect(this.signers.deployer).deploy(this.sushiRouter.address, this.ilv.address);

    await this.ilv.connect(this.signers.deployer).approve(this.sushiRouter.address, MaxUint256);
    await this.sushiRouter
      .connect(this.signers.deployer)
      .addLiquidityETH(
        this.ilv.address,
        toWei(100000),
        toWei(100000),
        toWei(10000),
        this.signers.deployer.address,
        MaxUint256,
        { value: toWei(1000) },
      );

    this.lp = this.ERC20.attach(await this.sushiFactory.getPair(this.weth.address, this.ilv.address));
    this.lpPoolV1 = await this.CorePoolV1.connect(this.signers.deployer).deploy(this.lp.address);
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

    await this.lp.connect(this.signers.deployer).transfer(await toAddress(this.signers.alice), toWei(500));
    await this.lp.connect(this.signers.deployer).transfer(await toAddress(this.signers.bob), toWei(500));
    await this.lp.connect(this.signers.deployer).transfer(await toAddress(this.signers.carol), toWei(500));
  });
  describe("#setCorePools", setCorePools());
  describe("#swapETHForILV", swapETHForILV());
  describe("#sendILVRewards", sendILVRewards());
});
