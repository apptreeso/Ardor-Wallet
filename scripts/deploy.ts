import { ethers, upgrades } from "hardhat";

import {
  ILVPool__factory,
  ILVPoolUpgrade__factory,
  ILVPool,
  SushiLPPool__factory,
  SushiLPPoolUpgrade__factory,
  SushiLPPool,
  PoolFactory__factory,
  PoolFactoryUpgrade__factory,
  PoolFactory,
  ERC20Mock__factory,
} from "../typechain";

import { config } from "./config/index";

async function main(): Promise<void> {
  const ILVPool = <ILVPool__factory>await ethers.getContractFactory("ILVPool");
  const SushiLPPool = <SushiLPPool__factory>await ethers.getContractFactory("SushiLPPool");
  const PoolFactory = <PoolFactory__factory>await ethers.getContractFactory("PoolFactory");

  const factoryPending = (await upgrades.deployProxy(
    PoolFactory,
    [config.ilv, config.silv, config.ILV_PER_SECOND, config.SECONDS_PER_UPDATE, "1640734004", "1640850162"],
    { kind: "uups" },
  )) as PoolFactory;

  const factory = await factoryPending.deployed();

  const ilvPoolPending = (await upgrades.deployProxy(
    ILVPool,
    [
      config.ilv,
      config.silv,
      config.ilv,
      factory.address,
      "1640734004",
      200,
      "0xD0768dbCA432F405331685eFEE23f1a8b7bD72F7",
      "1640734004",
    ],
    { kind: "uups" },
  )) as ILVPool;
  const lpPoolPending = (await upgrades.deployProxy(
    SushiLPPool,
    [
      config.ilv,
      config.silv,
      "0x65544e52fc7ab9281b6d543012825e810cd86f4f",
      factory.address,
      "1640734004",
      800,
      "0xf763B017E5dd298dCE2c24729aF54e9fD76Cfca8",
      "1640734004",
    ],
    { kind: "uups" },
  )) as SushiLPPool;

  const ilvPool = await ilvPoolPending.deployed();
  const lpPool = await lpPoolPending.deployed();

  console.log(ilvPool.address);
  console.log(lpPool.address);
  console.log(factory.address);
}

// We recommend this pattern to be able to use async/await everywhere and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
