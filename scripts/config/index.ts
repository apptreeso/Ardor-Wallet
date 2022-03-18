import { BigNumber } from "ethers";
import { ethers } from "hardhat";

export const toWei = (value: number): BigNumber => ethers.utils.parseEther(value.toString());

export const config = {
  ilv: "0xb671194b2e9fb884f65b92a1dbab875e5f76ec5c",
  silv: "0x634E7Ce4e81f1F4D033399C0672d3df94e38698E",
  weth: '0xc778417E063141139Fce010982780140Aa0cD5Ab',
  lp: "0x65544e52fc7ab9281b6d543012825e810cd86f4f",
  ilvPoolV1: "0x5E309204D729aC804e6D381ce68aD1Ad613c84B4",
  lpPoolV1: "0x4c9F1bDB5D145fa9cCc5d8721781194F01041411",
  factory: "0x98745A199cd9eb1A18496f6208e7fe34997bC639",
  flashToken: "0x76047802c5c73aac0e1939a55a0a0ca9c6f26552",
  router: "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506",
  ILV_POOL_WEIGHT: 200,
  LP_POOL_WEIGHT: 800,
  FLASH_POOL_WEIGHT: 50,
  ILV_PER_SECOND: toWei(1),
  SECONDS_PER_UPDATE: 1209600,
};
