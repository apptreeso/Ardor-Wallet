import MerkleTree from "./merkle-tree";
import { BigNumber, utils } from "ethers";

export default class YieldTree {
  private readonly tree: MerkleTree;
  constructor(yieldWeights: { account: string; weight: BigNumber }[]) {
    this.tree = new MerkleTree(
      yieldWeights.map(({ account, weight }, index) => {
        return YieldTree.toNode(index, account, weight);
      }),
    );
  }

  public static verifyProof(
    index: number | BigNumber,
    account: string,
    weight: BigNumber,
    proof: Buffer[],
    root: Buffer,
  ): boolean {
    let pair = YieldTree.toNode(index, account, weight);
    for (const item of proof) {
      pair = MerkleTree.combinedHash(pair, item);
    }

    return pair.equals(root);
  }

  // keccak256(abi.encode(index, account, weight))
  public static toNode(index: number | BigNumber, account: string, weight: BigNumber): Buffer {
    return Buffer.from(
      utils.solidityKeccak256(["uint256", "address", "uint256"], [index, account, weight]).substr(2),
      "hex",
    );
  }

  public getHexRoot(): string {
    return this.tree.getHexRoot();
  }

  // returns the hex bytes32 values of the proof
  public getProof(index: number | BigNumber, account: string, weight: BigNumber): string[] {
    return this.tree.getHexProof(YieldTree.toNode(index, account, weight));
  }
}
