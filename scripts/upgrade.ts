import { ethers, upgrades } from "hardhat";

import {
  ILVPool__factory,
  SushiLPPool__factory,

} from "../typechain";


import { config } from "./config/index";

async function main(): Promise<void> {
  const ILVPool = <ILVPool__factory>await ethers.getContractFactory("ILVPool");
  const SushiLPPool = <SushiLPPool__factory>await ethers.getContractFactory("SushiLPPool");

  console.log("deploying new Sushi LP Pool implementation..");
  await upgrades.prepareUpgrade(config.lpPoolV2, SushiLPPool);
  console.log("done!");
  console.log("deploying new ILV Pool implementation..");
  await upgrades.prepareUpgrade(config.ilvPoolV2, ILVPool);

  console.log("done!");

}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
