import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";

import { ERC20Mock, ILVPoolMock, SushiLPPoolMock, CorePoolV1Mock } from "../../types";

export const SECONDS_PER_UPDATE = 1209600;

// TODO: use correct value
export const ILV_PER_SECOND: BigNumber = ethers.utils.parseEther("1");

// TODO: use correct value
export const INIT_TIME = 10;

export const FLASH_INIT_TIME = 20;

export const FLASH_POOL_WEIGHT = 25;

// TODO: use correct value
export const END_TIME = 63072000;

export const ILV_POOL_WEIGHT = 200;

export const LP_POOL_WEIGHT = 800;

// TODO: use correct value
export const V1_STAKE_MAX_PERIOD = 20;

export const toWei = (value: number): BigNumber => ethers.utils.parseEther(value.toString());

export const toAddress = (signer: Signer): Promise<string> => signer.getAddress();

export const getToken = (ilvInstance: ERC20Mock, lpInstance: ERC20Mock, usingPool: string): ERC20Mock =>
  usingPool === "ILV" ? ilvInstance : lpInstance;

export const getPool = (
  ilvPoolInstance: ILVPoolMock,
  lpPoolInstance: SushiLPPoolMock,
  usingPool: string,
): ILVPoolMock | SushiLPPoolMock => (usingPool === "ILV" ? ilvPoolInstance : lpPoolInstance);

export const getV1Pool = (
  ilvPoolInstance: CorePoolV1Mock,
  lpPoolInstance: CorePoolV1Mock,
  usingPool: string,
): CorePoolV1Mock => (usingPool === "ILV" ? ilvPoolInstance : lpPoolInstance);

export const ONE_YEAR = 31536000;
