import { ethers, upgrades } from "hardhat";

import {
  ILVPool__factory,
  ILVPool,
  SushiLPPool__factory,
  SushiLPPool,
  PoolFactory__factory,
  PoolFactory,
} from "../typechain";

import { config } from "./config/index";

async function main(): Promise<void> {
  const ILVPool = <ILVPool__factory>await ethers.getContractFactory("ILVPool");
  const SushiLPPool = <SushiLPPool__factory>await ethers.getContractFactory("SushiLPPool");
  const PoolFactory = <PoolFactory__factory>await ethers.getContractFactory("PoolFactory");

  console.log("deploying pool factory...");

  const factoryPending = (await upgrades.deployProxy(
    PoolFactory,
    [
      config.ilv,
      config.silv,
      config.ILV_PER_SECOND,
      config.SECONDS_PER_UPDATE,
      (new Date().getTime() / 1000).toFixed(0),
      (new Date().getTime() / 1000 + config.SECONDS_PER_UPDATE * 96).toFixed(0),
    ],
    { kind: "uups" },
  )) as PoolFactory;

  const factory = await factoryPending.deployed();

  console.log(`Pool factory deployed at ${factory.address}`);
  console.log("deploying ILV pool...");

  const ilvPoolPending = (await upgrades.deployProxy(
    ILVPool,
    [
      config.ilv,
      config.silv,
      config.ilv,
      factory.address,
      (new Date().getTime() / 1000).toFixed(0),
      config.ILV_POOL_WEIGHT,
      config.ilvPoolV1,
      // (new Date().getTime() / 1000).toFixed(0),
      ethers.constants.MaxUint256
    ],
    { kind: "uups" },
  )) as ILVPool;

  const ilvPool = await ilvPoolPending.deployed();
  console.log(`ILV Pool deployed at ${ilvPool.address}`);

  console.log("deploying Sushi LP pool...");
  const lpPoolPending = (await upgrades.deployProxy(
    SushiLPPool,
    [
      config.ilv,
      config.silv,
      config.lp,
      factory.address,
      (new Date().getTime() / 1000).toFixed(0),
      config.LP_POOL_WEIGHT,
      config.lpPoolV1,
      // (new Date().getTime() / 1000).toFixed(0),
      ethers.constants.MaxUint256
    ],
    { kind: "uups" },
  )) as SushiLPPool;

  const lpPool = await lpPoolPending.deployed();
  console.log(`LP Pool deployed at ${lpPool.address}`);

  console.log("registering deployed core pools in the factory..");

  const tx0 = await factory.registerPool(ilvPool.address);
  await tx0.wait();
  console.log("ILV pool registered successfully!");
  const tx1 = await factory.registerPool(lpPool.address);
  await tx1.wait();
  console.log("Sushi LP pool registered successfully!");

  console.log(ilvPool.address);
  console.log(lpPool.address);
  console.log(factory.address);
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
