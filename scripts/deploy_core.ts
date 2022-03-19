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
import { toWei } from "../test/utils";

import { config } from "./config/index";

import rinkebyData from "./data/weight_data_rinkeby_v1.json";

const parseEther = ethers.utils.parseEther;

async function main(): Promise<void> {
  const ILVPool = <ILVPool__factory>await ethers.getContractFactory("ILVPool");
  const SushiLPPool = <SushiLPPool__factory>await ethers.getContractFactory("SushiLPPool");
  const PoolFactory = <PoolFactory__factory>await ethers.getContractFactory("PoolFactory");

  console.log("generating merkle tree...");

  const parsedData = JSON.parse(JSON.stringify(rinkebyData));
  let treeData = [];

  for (let i = 0; i < 63; i++) {
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

  for (let i = 63; i < 20001; i++) {
    treeData[i] = {
      account: "0xFE61c62Bb23FBEbBf1e1FDE999b95cCc7F416d17",
      pendingV1Rewards: parseEther(String(Math.floor(Math.random() * 10))),
      weight: parseEther(String(Math.floor(Math.random() * 10))),
    };
  }

  // const treeDataJSON = JSON.stringify(treeData.map(e => ({ ...e, pendingV1Rewards: e.pendingV1Rewards.toString(), weight: e.weight.toString() })))

  fs.writeFileSync("./scripts/data/treeA.json", JSON.stringify(treeData));

  console.log("merkle tree generated!");
  console.log("deploying pool factory...");

  const factoryPending = (await upgrades.deployProxy(
    PoolFactory,
    [
      config.ilv,
      config.silv,
      config.ILV_PER_SECOND.div(20),
      config.SECONDS_PER_UPDATE,
      // (new Date().getTime() / 1000 + config.SECONDS_PER_UPDATE * 96).toFixed(0),
      // (new Date().getTime() / 1000).toFixed(0),
      1647604109,
      // (new Date().getTime() / 1000 + config.SECONDS_PER_UPDATE * 192).toFixed(0),
      // (new Date().getTime() / 1000 + config.SECONDS_PER_UPDATE * 96).toFixed(0),
      (1647604109 + config.SECONDS_PER_UPDATE * 96).toFixed(0),
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
      1647604109,
      // (new Date().getTime() / 1000).toFixed(0),
      // (new Date().getTime() / 1000 + config.SECONDS_PER_UPDATE * 96).toFixed(0),
      config.ILV_POOL_WEIGHT,
      config.ilvPoolV1,
      1647604109,
      // (new Date().getTime() / 1000).toFixed(0),
      // ethers.constants.MaxUint256,
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
      1647604109,
      // (new Date().getTime() / 1000).toFixed(0),
      // (new Date().getTime() / 1000 + config.SECONDS_PER_UPDATE * 96).toFixed(0),
      config.LP_POOL_WEIGHT,
      config.lpPoolV1,
      1647604109,
      // (new Date().getTime() / 1000).toFixed(0),
      // ethers.constants.MaxUint256,
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

  // const ilvPool = await ethers.getContractAt("ILVPool", "0xc13114989C1cA615531fa29596b1E6Ec8E3Cba4F");
  // // const usersData = [
  // //   {
  // //     account: "0x0d5880bA57De46d6e00CA5d7A5d25A7eb9b573e7",
  // //     weight: parseEther(`${2000}`),
  // //     pendingV1Rewards: parseEther(`${1000}`),
  // //   },
  // //   {
  // //     account: "0xEA4192502Ce200676Fc73526aaAe8B0246797c2B",
  // //     weight: parseEther(`${10000}`),
  // //     pendingV1Rewards: parseEther(`${5000}`),
  // //   },
  // //   {
  // //     account: "0xefBAb868E9C7429D8C39531BaC62609A957AeFe7",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0xa18bCf84A4b7d6D117d2484A412FD94c0AcD25d9",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0xf87e330B77C6154b84320c18184ca63bF501eb26",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0xAf0964f1F5053615c0ad46976B8d726A42d99330",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x73a6aFE00c76ee62578C3C30D717EF08a9e0aaE3",
  // //     weight: parseEther(`${5000}`),
  // //     pendingV1Rewards: parseEther(`${200}`),
  // //   },
  // //   {
  // //     account: "0xfd4bd07eF95a8C53eb7192fA055909c716f01409",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x3E257E38FE3B0Af318b2015693050Db432F0FEbb",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x27fD0d10A140D3F85BE71e4a3F0Be950A66666D9",
  // //     weight: parseEther(`${100}`),
  // //     pendingV1Rewards: parseEther(`${6000}`),
  // //   },
  // //   {
  // //     account: "0x6f594de0278Ab06B04dD9F8E8af51D898FA77E8D",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0xb0F44B0a51FD310990fE1D343AfEAED770ea5DB5",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x0691f5804d4227925F19b031821b530b48FFf38f",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x376E30F5BaDd3cEF83Efd9E39efA0ACC85e29DBA",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0xa18bCf84A4b7d6D117d2484A412FD94c0AcD25d9",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0xf87e330B77C6154b84320c18184ca63bF501eb26",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0xAf0964f1F5053615c0ad46976B8d726A42d99330",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x320e0C4C4474B83529b1786d8A17d12f4C37feDE",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x5B5193FF152F064e747451b1D0A25024bE3c389E",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x7058898880e0424D0ebFEb904267f17bB9fb9f2B",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0xCbF05cA34c00D523bBB72416F284cd1D52d6F523",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0xb6CCed9C8262642ee00b37a3c8Ae491c6159EFD9",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0xc7a070a66c7f2C61D65A3E17F5995650F4475D13",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x924b4FE2873E7e4e2237e642415A019Cc058D9A7",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x9FF48e4EeE75C97c205fC168652754De09b2d926",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0xe39c201F5f16E46B91c8Ed4018a233b437612078",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x814528A7eb374B74Ed899661296eE2Bb65707DEB",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0xE494518E3E687c97F622f547fEe7367adb7370eD",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0xFDFA447576E6B25c3F8aCb4ae799C459E157563B",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0xb703D63f87062eF5e1DF206Af2fAd1005c38f762",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x452c1fD33b8e7fF0ea01daD3bfEDf1f4ffF9Df70",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x1Db12d455FE8c57422C5d1447748576be1Dce3e1",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x25DE374e906FcBA19c4228775973206369b593d6",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x0eE0Cb844D8880f28FdB907A5aA396552Baa80b8",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0xB6909244AC295C70dfe98016b87d4059D2345A91",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x029aD119eE52EEBB710Ef3daBAa4Da21343f6863",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x135A4DB6c6bf0D7529F121a9f8B3Fe8625186E87",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x1Ff079172a6Ed44320D225ca514D9af5D895754d",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0xeeACe61fD1EAb9090EF451B2b52b076dc046Fd62",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0xf1c1f3D490409c1133F220A4392DB46d2264f398",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0xc562C24E7c7FcA33E9dE5D4E99d228521F106d64",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0xbE2B59b5A3f383C3ADa9A1E4a5AAEcDb1f97294B",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0xbAD7B321d3459C25794385944463D1a01F906412",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x1ea27E1d853Bc781661fE90041cFa86502876E11",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x546E346700dcE8Dc76709E3f243821c4F7EF8bdE",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x6450AcA1da1ffa37e00435C107278C54519c887B",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // //   {
  // //     account: "0x2df02411d040d14318749bA9d8729172879628c8",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0xC7dDDE236E33d07d100C84Cd63aD92B59C2B3940",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x660Db09E468A6Cd93Eb8AaC5D8A37192Ccc360B8",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0xCEC081C610F71f92aDd6bd1c353bA670fBC26879",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x4AdD32A356eB4636A2f7AaE35610715d667D1d7E",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x7FAaeC0891E6175bfe3838ecb120Bd29583093f5",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x40bE9547278EBAde75b39a547E1F0f3d8487b0bf",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x843E55ad92529B18A6223727d755B5A2F0204D14",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x4c5e6067D9Be73CD8998af711183d218A90D199b",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x1d2B11d10339310E2738Dad6B73a1DDefcff791C",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x5B9132843ebd2b3a484DeeF466589ac1A3De34ac",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x3417DBa53002D349186bAb6E57a059931430B24B",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x5dE4d10b49e182075E43D1A90b6a261865884840",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0xeE7d405278fE880F5d4b52096f076a520D509628",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x1A9bE656318440eb0c008f0B0b70F7553e5F378d",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0xca4173f5f808047807B14Dff03CB4Ba11D2CE1B8",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x26AEc623cb7a80238bA686a144Db98747a36ef3f",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0xe17DD95691F49F1A8f9f6895d0BF4751E869f8CA",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0xB5bbD92E7120aA46acC29DFDB4b9008C60b5746c",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0xfdeb3959995e796d2eF57277cA3DEf7312704982",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },

  // //   {
  // //     account: "0x2Bb0301ef48a079Cc4401a41FA3f5cb402C95039",
  // //     weight: parseEther(`${4000}`),
  // //     pendingV1Rewards: parseEther(`${500}`),
  // //   },
  // // ];

  const merkleTree = new YieldTree(treeData);

  console.log(merkleTree.getHexRoot());
  // console.log(usersData.length);

  const tx = await ilvPool.setMerkleRoot(merkleTree.getHexRoot());

  // // // const proof = merkleTree.getProof(18, "0x5B5193FF152F064e747451b1D0A25024bE3c389E" , toWei(4000), toWei(500));
  // console.log("sent..");
  // // console.log(await ilvPool.estimateGas.executeMigration(proof, 18, toWei(4000), toWei(500), false, []));
  await tx.wait();
  console.log("mined!");

  // console.log(await ilvPool.merkleRoot());
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
