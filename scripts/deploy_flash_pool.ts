import { ethers, upgrades } from "hardhat";

import { FlashPool__factory, FlashPool, PoolFactory } from "../typechain";

import { config } from "./config/index";

async function main(): Promise<void> {
  const FlashPool = <FlashPool__factory>await ethers.getContractFactory("FlashPool");
  const factory = <PoolFactory>await ethers.getContractAt("PoolFactory", config.factory);

  console.log("deploying flash pool...");

  const flashPoolPending = (await upgrades.deployProxy(
    FlashPool,
    [
      config.ilv,
      config.silv,
      config.flashToken,
      config.factory,
      (new Date().getTime() / 1000).toFixed(0),
      (new Date().getTime() / 1000 + config.SECONDS_PER_UPDATE * 96).toFixed(0),
      config.FLASH_POOL_WEIGHT,
    ],
    { kind: "uups" },
  )) as FlashPool;

  const flashPool = await flashPoolPending.deployed();
  console.log(`Flash pool deployed at ${flashPool.address}`);

  const tx0 = await factory.registerPool(flashPool.address);
  await tx0.wait();
  console.log("Flash pool registered successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
