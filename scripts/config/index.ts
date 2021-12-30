import { BigNumber } from "ethers";
import { ethers } from "hardhat";

export const toWei = (value: number): BigNumber => ethers.utils.parseEther(value.toString());

export const config = {
  ilv: "0xb671194b2e9fb884f65b92a1dbab875e5f76ec5c",
  silv: "0x5051c7f88bCC6c9c4882A3A342a90ace4f90446A",
  lp: "0x65544e52fc7ab9281b6d543012825e810cd86f4f",
  ilvPoolV1: "0xD0768dbCA432F405331685eFEE23f1a8b7bD72F7",
  lpPoolV1: "0xf763B017E5dd298dCE2c24729aF54e9fD76Cfca8",
  factory: "0xC82E4E3b8Ac5A878bcdeFf5aD7D6270F7D86AB38",
  flashToken: "0x76047802c5c73aac0e1939a55a0a0ca9c6f26552",
  ILV_POOL_WEIGHT: 200,
  LP_POOL_WEIGHT: 800,
  FLASH_POOL_WEIGHT: 50,
  ILV_PER_SECOND: toWei(1),
  SECONDS_PER_UPDATE: 1209600,
};
