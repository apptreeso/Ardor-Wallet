import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

export {
  ILVPoolMock__factory,
  ILVPoolMock,
  SushiLPPoolMock__factory,
  SushiLPPoolMock,
  PoolFactoryMock__factory,
  PoolFactoryMock,
  ERC20Mock__factory,
  ERC20Mock,
} from "../typechain";

export interface Signers {
  admin: SignerWithAddress;
}
