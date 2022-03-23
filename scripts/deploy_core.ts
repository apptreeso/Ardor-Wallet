import { ethers, upgrades } from "hardhat";
import fs from "fs";

import {
  ILVPool__factory,
  ILVPool,
  SushiLPPool__factory,
  SushiLPPool,
  PoolFactory__factory,
  PoolFactory,
} from "../typechain";

import YieldTree from "../test/utils/yield-tree";

import { config } from "./config/index";

import mainnetData from './data/mainnet_raw.json';

async function main(): Promise<void> {
  const ILVPool = <ILVPool__factory>await ethers.getContractFactory("ILVPool");
  const SushiLPPool = <SushiLPPool__factory>await ethers.getContractFactory("SushiLPPool");
  const PoolFactory = <PoolFactory__factory>await ethers.getContractFactory("PoolFactory");

  console.log("generating merkle tree...");

  const parsedData = JSON.parse(JSON.stringify(mainnetData));
  let treeData = [];

  for (let i = 0; i <= 20316; i++) {
    treeData[i] = {
      account: parsedData[i].Address as string,
      pendingV1Rewards: ethers.BigNumber.from(parsedData[i].PendingYield).add(
        ethers.BigNumber.from(parsedData[i].Emissions_Total),
      ),
      weight:
        Number(parsedData[i].ClaimedYield) != 0
          ? ethers.BigNumber.from(parsedData[i].ClaimedYield).mul(2e6)
          : ethers.BigNumber.from(1),
    };
  }

  console.log(`tree length is ${treeData.length}`)

  fs.writeFileSync("./scripts/data/mainnet_tree.json", JSON.stringify(treeData));

  console.log("merkle tree generated!");
  console.log("deploying pool factory...");

  const factoryPending = (await upgrades.deployProxy(
    PoolFactory,
    [
      config.ilv,
      config.silv,
      config.ILV_PER_SECOND,
      config.SECONDS_PER_UPDATE,
      config.INIT_TIMESTAMP,
      config.V2_END_TIMESTAMP,
    ],
    { kind: "uups" },
  )) as PoolFactory;

  const factory = await factoryPending.deployed();

  console.log(`Pool Factory deployed at ${factory.address}`);
  console.log("deploying ILV pool...");

  const ilvPoolPending = (await upgrades.deployProxy(
    ILVPool,
    [
      config.ilv,
      config.silv,
      config.ilv,
      factory.address,
      config.INIT_TIMESTAMP,
      config.ILV_POOL_WEIGHT,
      config.ilvPoolV1,
      config.STAKING_V1_END_TIMESTAMP
    ],
    { kind: "uups" },
  )) as ILVPool;

  const ilvPool = await ilvPoolPending.deployed();
  console.log(`ILV Pool deployed at ${ilvPool.address}`);
  console.log(`setting v1 global weight: ${config.V1_GLOBAL_WEIGHT}`);
  const weightTx = await ilvPool.setV1GlobalWeight(ethers.BigNumber.from(config.V1_GLOBAL_WEIGHT));
  await weightTx.wait();
  console.log("done!");
  console.log(`setting v1 pool token reserve: ${config.V1_POOL_TOKEN_RESERVE}`);
  const tokenReserveTX = await ilvPool.setV1PoolTokenReserve(ethers.BigNumber.from(config.V1_POOL_TOKEN_RESERVE));
  await tokenReserveTX.wait()
  console.log("done!");

  const merkleTree = new YieldTree(treeData);
  console.log(`setting merkle root: ${merkleTree.getHexRoot()}`);
  const tx = await ilvPool.setMerkleRoot(merkleTree.getHexRoot());
  await tx.wait();
  console.log("mined!");
  console.log(`merkle root set: ${await ilvPool.merkleRoot()}`);

  console.log("deploying Sushi LP pool...");
  const lpPoolPending = (await upgrades.deployProxy(
    SushiLPPool,
    [
      config.ilv,
      config.silv,
      config.lp,
      factory.address,
      config.INIT_TIMESTAMP,
      config.LP_POOL_WEIGHT,
      config.lpPoolV1,
      config.STAKING_V1_END_TIMESTAMP
    ],
    { kind: "uups" },
  )) as SushiLPPool;

  const lpPool = await lpPoolPending.deployed();
  console.log(`Sushi LP Pool deployed at ${lpPool.address}`);
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
