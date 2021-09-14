import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

export { ILVPool__factory, SushiLPPool__factory, PoolFactory__factory, ERC20__factory } from "../typechain";

export interface Signers {
  admin: SignerWithAddress;
}
