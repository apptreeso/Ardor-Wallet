import { ethers, upgrades } from "hardhat";

import { Vault__factory, ILVPool, SushiLPPool } from "../typechain";

import YieldTree from "../test/utils/yield-tree";
import { toWei } from "../test/utils";

import { config } from "./config/index";

import rinkebyData from "./data/weight_data_rinkeby_v1.json";

const parseEther = ethers.utils.parseEther;

async function main(): Promise<void> {
  const Vault = <Vault__factory>await ethers.getContractFactory("Vault");

  console.log("Deploying vault contract..");
  const deployVaultTx = await Vault.deploy(config.router, config.ilv)
  const vault = await deployVaultTx.deployed();
  console.log(`Vault contract deployed at ${vault.address}`);

  const ilvPool = <ILVPool>await ethers.getContractAt("ILVPool", "0xF13d7BE83957C5ba20fa056e6dc08bA45e24c511")
  const lpPool = <SushiLPPool>await ethers.getContractAt("SushiLPPool", "0xD52cf708252d27409b1cF8F6d27908DA620ea8e7")

  console.log("Setting vault in the ILV pool..");
  await ilvPool.setVault(vault.address);
  console.log("Success!");
  console.log("Setting vault in the LP pool..");
  await lpPool.setVault(vault.address);
  console.log("Success!");
}

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
