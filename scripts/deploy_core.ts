import { ethers, upgrades } from "hardhat";

import {
  ILVPool__factory,
  ILVPool,
  SushiLPPool__factory,
  SushiLPPool,
  PoolFactory__factory,
  PoolFactory,
} from "../typechain";

import YieldTree from "../test/utils/yield-tree";
import { toWei } from "../test/utils";

import { config } from "./config/index";

const parseEther = ethers.utils.parseEther;

async function main(): Promise<void> {
  // const ILVPool = <ILVPool__factory>await ethers.getContractFactory("ILVPoolMock");
  // const SushiLPPool = <SushiLPPool__factory>await ethers.getContractFactory("SushiLPPoolMock");
  // const PoolFactory = <PoolFactory__factory>await ethers.getContractFactory("PoolFactoryMock");

  // console.log("deploying pool factory...");

  // const factoryPending = (await upgrades.deployProxy(
  //   PoolFactory,
  //   [
  //     config.ilv,
  //     config.silv,
  //     config.ILV_PER_SECOND.div(20),
  //     config.SECONDS_PER_UPDATE,
  //     // (new Date().getTime() / 1000 + config.SECONDS_PER_UPDATE * 96).toFixed(0),
  //     (new Date().getTime() / 1000).toFixed(0),
  //     // (new Date().getTime() / 1000 + config.SECONDS_PER_UPDATE * 192).toFixed(0),
  //     (new Date().getTime() / 1000 + config.SECONDS_PER_UPDATE * 96).toFixed(0),
  //   ],
  //   { kind: "uups" },
  // )) as PoolFactory;

  // const factory = await factoryPending.deployed();

  // console.log(`Pool factory deployed at ${factory.address}`);
  // console.log("deploying ILV pool...");

  // const ilvPoolPending = (await upgrades.deployProxy(
  //   ILVPool,
  //   [
  //     config.ilv,
  //     config.silv,
  //     config.ilv,
  //     factory.address,
  //     (new Date().getTime() / 1000).toFixed(0),
  //     // (new Date().getTime() / 1000 + config.SECONDS_PER_UPDATE * 96).toFixed(0),
  //     config.ILV_POOL_WEIGHT,
  //     config.ilvPoolV1,
  //     (new Date().getTime() / 1000).toFixed(0),
  //     // ethers.constants.MaxUint256,
  //   ],
  //   { kind: "uups" },
  // )) as ILVPool;

  // const ilvPool = await ilvPoolPending.deployed();
  // console.log(`ILV Pool deployed at ${ilvPool.address}`);

  // console.log("deploying Sushi LP pool...");
  // const lpPoolPending = (await upgrades.deployProxy(
  //   SushiLPPool,
  //   [
  //     config.ilv,
  //     config.silv,
  //     config.lp,
  //     factory.address,
  //     (new Date().getTime() / 1000).toFixed(0),
  //     // (new Date().getTime() / 1000 + config.SECONDS_PER_UPDATE * 96).toFixed(0),
  //     config.LP_POOL_WEIGHT,
  //     config.lpPoolV1,
  //     (new Date().getTime() / 1000).toFixed(0),
  //     // ethers.constants.MaxUint256,
  //   ],
  //   { kind: "uups" },
  // )) as SushiLPPool;

  // const lpPool = await lpPoolPending.deployed();
  // console.log(`LP Pool deployed at ${lpPool.address}`);

  // console.log("registering deployed core pools in the factory..");

  // const tx0 = await factory.registerPool(ilvPool.address);
  // await tx0.wait();
  // console.log("ILV pool registered successfully!");
  // const tx1 = await factory.registerPool(lpPool.address);
  // await tx1.wait();
  // console.log("Sushi LP pool registered successfully!");

  // console.log(ilvPool.address);
  // console.log(lpPool.address);
  // console.log(factory.address);

  const ilvPool = await ethers.getContractAt("ILVPool", "0xc0349805354FAB5e7C5A5e39A53746D991C7C2E6");
  const usersData = [
    {
      account: '0x0d5880bA57De46d6e00CA5d7A5d25A7eb9b573e7',
      weight: parseEther(`${2000}`),
      pendingV1Rewards: parseEther(`${1000}`),
    },
    {
      account: '0xEA4192502Ce200676Fc73526aaAe8B0246797c2B',
      weight: parseEther(`${10000}`),
      pendingV1Rewards: parseEther(`${5000}`),
    },
    {
      account: '0xefBAb868E9C7429D8C39531BaC62609A957AeFe7',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0xa18bCf84A4b7d6D117d2484A412FD94c0AcD25d9',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0xf87e330B77C6154b84320c18184ca63bF501eb26',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0xAf0964f1F5053615c0ad46976B8d726A42d99330',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0x73a6aFE00c76ee62578C3C30D717EF08a9e0aaE3',
      weight: parseEther(`${5000}`),
      pendingV1Rewards: parseEther(`${200}`),
    },
    {
      account: '0xfd4bd07eF95a8C53eb7192fA055909c716f01409',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0x3E257E38FE3B0Af318b2015693050Db432F0FEbb',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0x27fD0d10A140D3F85BE71e4a3F0Be950A66666D9',
      weight: parseEther(`${100}`),
      pendingV1Rewards: parseEther(`${6000}`),
    },
    {
      account: '0x6f594de0278Ab06B04dD9F8E8af51D898FA77E8D',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0xb0F44B0a51FD310990fE1D343AfEAED770ea5DB5',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0x0691f5804d4227925F19b031821b530b48FFf38f',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0x376E30F5BaDd3cEF83Efd9E39efA0ACC85e29DBA',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0xa18bCf84A4b7d6D117d2484A412FD94c0AcD25d9',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0xf87e330B77C6154b84320c18184ca63bF501eb26',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0xAf0964f1F5053615c0ad46976B8d726A42d99330',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0x320e0C4C4474B83529b1786d8A17d12f4C37feDE',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0x5B5193FF152F064e747451b1D0A25024bE3c389E',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0x7058898880e0424D0ebFEb904267f17bB9fb9f2B',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0xCbF05cA34c00D523bBB72416F284cd1D52d6F523',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0xb6CCed9C8262642ee00b37a3c8Ae491c6159EFD9',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0xc7a070a66c7f2C61D65A3E17F5995650F4475D13',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0x924b4FE2873E7e4e2237e642415A019Cc058D9A7',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0x9FF48e4EeE75C97c205fC168652754De09b2d926',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0xe39c201F5f16E46B91c8Ed4018a233b437612078',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0x814528A7eb374B74Ed899661296eE2Bb65707DEB',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0xE494518E3E687c97F622f547fEe7367adb7370eD',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0xFDFA447576E6B25c3F8aCb4ae799C459E157563B',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0xb703D63f87062eF5e1DF206Af2fAd1005c38f762',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0x452c1fD33b8e7fF0ea01daD3bfEDf1f4ffF9Df70',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
    {
      account: '0x1Db12d455FE8c57422C5d1447748576be1Dce3e1',
      weight: parseEther(`${4000}`),
      pendingV1Rewards: parseEther(`${500}`),
    },
  ]




  const merkleTree = new YieldTree(usersData);

  console.log(merkleTree.getHexRoot());
  // console.log(usersData.length);

  const tx = await ilvPool.setMerkleRoot(merkleTree.getHexRoot());

  // // const proof = merkleTree.getProof(18, "0x5B5193FF152F064e747451b1D0A25024bE3c389E" , toWei(4000), toWei(500));
  console.log("sent..");
  // console.log(await ilvPool.estimateGas.executeMigration(proof, 18, toWei(4000), toWei(500), false, []));
  await tx.wait()
  console.log("mined!");

  // console.log(await ilvPool.merkleRoot());
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
