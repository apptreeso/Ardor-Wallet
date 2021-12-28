import { BigNumber } from "ethers";
import { ethers } from "hardhat";

export const toWei = (value: number): BigNumber => ethers.utils.parseEther(value.toString());

export const config = {
  ilv: "0xb671194b2e9fb884f65b92a1dbab875e5f76ec5c",
  silv: "0x5051c7f88bCC6c9c4882A3A342a90ace4f90446A",
  ILV_PER_SECOND: toWei(1),
  SECONDS_PER_UPDATE: 1209600,
};
