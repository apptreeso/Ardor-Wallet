import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

export {
  ILVPoolMock__factory,
  ILVPoolUpgrade__factory,
  ILVPoolMock,
  ILVPoolUpgrade,
  SushiLPPoolMock__factory,
  SushiLPPoolUpgrade__factory,
  SushiLPPoolMock,
  SushiLPPoolUpgrade,
  FlashPoolMock__factory,
  FlashPoolMock,
  PoolFactoryMock__factory,
  PoolFactoryMock,
  Vault__factory,
  Vault,
  WETHMock__factory,
  WETHMock,
  ERC20Mock__factory,
  ERC20Mock,
  CorePoolV1Mock__factory,
  CorePoolV1Mock,
} from "../typechain";

export interface Signers {
  deployer: SignerWithAddress;
  alice: SignerWithAddress;
  bob: SignerWithAddress;
  carol: SignerWithAddress;
}
