import { Signers } from "./";
import {
  ILVPoolMock__factory,
  ILVPoolMock,
  SushiLPPoolMock__factory,
  SushiLPPoolMock,
  PoolFactoryMock__factory,
  PoolFactoryMock,
  ERC20Mock__factory,
  ERC20Mock,
} from ".";

declare module "mocha" {
  export interface Context {
    ILVPool: ILVPoolMock__factory;
    SushiLPPool: SushiLPPoolMock__factory;
    PoolFactory: PoolFactoryMock__factory;
    ERC20: ERC20Mock__factory;
    ilvPool: ILVPoolMock;
    lpPool: SushiLPPoolMock;
    factory: PoolFactoryMock;
    ilv: ERC20Mock;
    silv: ERC20Mock;
    lp: ERC20Mock;
    signers: Signers;
  }
}
