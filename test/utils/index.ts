import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";

import { ERC20Mock, ILVPoolMock, SushiLPPoolMock, CorePoolV1Mock } from "../../types";

export const SECONDS_PER_UPDATE = 1209600;

export const ILV_PER_SECOND: BigNumber = ethers.utils.parseEther("1");

export const INIT_TIME = 10;

export const FLASH_INIT_TIME = 20;

export const FLASH_POOL_WEIGHT = 25;

export const END_TIME = 63072000;

export const ILV_POOL_WEIGHT = 200;

export const LP_POOL_WEIGHT = 800;

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

export const ONE_MONTH = 2592000;

export const getUsers0 = (addresses: string[]) => [
  {
    userAddress: addresses[0],
    deposits: [
      {
        tokenAmount: toWei(200),
        weight: toWei(200).mul(2e6),
        lockedFrom: INIT_TIME,
        lockedUntil: INIT_TIME + ONE_YEAR,
        isYield: false,
      },
      {
        tokenAmount: toWei(500),
        weight: toWei(500).mul(2e6),
        lockedFrom: INIT_TIME,
        lockedUntil: INIT_TIME + ONE_YEAR,
        isYield: true,
      },
      {
        tokenAmount: toWei(300),
        weight: toWei(300).mul(2e6),
        lockedFrom: INIT_TIME,
        lockedUntil: INIT_TIME + ONE_YEAR,
        isYield: false,
      },
    ],
  },
  {
    userAddress: addresses[1],
    deposits: [
      {
        tokenAmount: toWei(100),
        weight: toWei(100).mul(1e6),
        lockedFrom: 0,
        lockedUntil: 0,
        isYield: false,
      },
      {
        tokenAmount: toWei(100),
        weight: toWei(100).mul(2e6),
        lockedFrom: INIT_TIME + 25,
        lockedUntil: INIT_TIME + 25 + ONE_YEAR,
        isYield: false,
      },
    ],
  },
  {
    userAddress: addresses[2],
    deposits: [
      {
        tokenAmount: toWei(500),
        weight: toWei(500).mul(1.5e6),
        lockedFrom: INIT_TIME,
        lockedUntil: INIT_TIME + ONE_YEAR / 2,
        isYield: false,
      },
      {
        tokenAmount: toWei(400),
        weight: toWei(400).mul(2e6),
        lockedFrom: INIT_TIME,
        lockedUntil: INIT_TIME + ONE_YEAR,
        isYield: true,
      },
      {
        tokenAmount: toWei(100),
        weight: toWei(100).mul(2e6),
        lockedFrom: INIT_TIME,
        lockedUntil: INIT_TIME + ONE_YEAR,
        isYield: false,
      },
    ],
  },
];

export const getUsers1 = (addresses: string[]) => [
  {
    userAddress: addresses[0],
    deposits: [
      {
        tokenAmount: toWei(200),
        weight: toWei(200).mul(2e6),
        lockedFrom: INIT_TIME,
        lockedUntil: INIT_TIME + ONE_YEAR,
        isYield: false,
      },
      {
        tokenAmount: toWei(500),
        weight: toWei(500).mul(2e6),
        lockedFrom: INIT_TIME,
        lockedUntil: INIT_TIME + ONE_YEAR,
        isYield: true,
      },
      {
        tokenAmount: toWei(300),
        weight: toWei(300).mul(2e6),
        lockedFrom: INIT_TIME,
        lockedUntil: INIT_TIME + ONE_YEAR,
        isYield: false,
      },
    ],
  },
  {
    userAddress: addresses[1],
    deposits: [
      {
        tokenAmount: toWei(100),
        weight: toWei(100).mul(1e6),
        lockedFrom: 0,
        lockedUntil: 0,
        isYield: false,
      },
      {
        tokenAmount: toWei(100),
        weight: toWei(100).mul(2e6),
        lockedFrom: INIT_TIME + 25,
        lockedUntil: INIT_TIME + 25 + ONE_YEAR,
        isYield: false,
      },
    ],
  },
  {
    userAddress: addresses[2],
    deposits: [
      {
        tokenAmount: toWei(500),
        weight: toWei(500).mul(2e6),
        lockedFrom: INIT_TIME,
        lockedUntil: INIT_TIME + ONE_YEAR,
        isYield: true,
      },
      {
        tokenAmount: toWei(400),
        weight: toWei(400).mul(2e6),
        lockedFrom: INIT_TIME,
        lockedUntil: INIT_TIME + ONE_YEAR,
        isYield: true,
      },
      {
        tokenAmount: toWei(100),
        weight: toWei(100).mul(2e6),
        lockedFrom: INIT_TIME,
        lockedUntil: INIT_TIME + ONE_YEAR,
        isYield: true,
      },
    ],
  },
];
