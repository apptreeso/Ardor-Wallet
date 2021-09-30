import { Signers } from "./";
import {
  ILVPoolMock__factory,
  ILVPoolMock,
  SushiLPPoolMock__factory,
  SushiLPPoolMock,
  FlashPoolMock__factory,
  FlashPoolMock,
  PoolFactoryMock__factory,
  PoolFactoryMock,
  CorePoolV1Mock__factory,
  CorePoolV1Mock,
  ERC20Mock__factory,
  ERC20Mock,
} from ".";

declare module "mocha" {
  export interface Context {
    ILVPool: ILVPoolMock__factory;
    SushiLPPool: SushiLPPoolMock__factory;
    FlashPool: FlashPoolMock__factory;
    PoolFactory: PoolFactoryMock__factory;
    CorePoolV1: CorePoolV1Mock__factory;
    ERC20: ERC20Mock__factory;
    ilvPool: ILVPoolMock;
    lpPool: SushiLPPoolMock;
    flashPool: FlashPoolMock;
    factory: PoolFactoryMock;
    ilvPoolV1: CorePoolV1Mock;
    lpPoolV1: CorePoolV1Mock;
    ilv: ERC20Mock;
    silv: ERC20Mock;
    lp: ERC20Mock;
    flashToken: ERC20Mock;
    signers: Signers;
  }
}
