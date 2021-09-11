import { TestHelper } from "zos";
require("chai").should();

const Sample = artifacts.require("Sample");
const ERC20 = artifacts.require("ERC20");

contract("Sample", function ([_, owner]) {
  beforeEach(async function () {
    this.project = await TestHelper({ from: owner });
  });

  it("should create a proxy", async function () {
    const proxy = await this.project.createProxy(Sample);
    const result = await proxy.greet();
    result.should.eq("A sample");
  });

  it("should create a proxy for the EVM package", async function () {
    const proxy = await this.project.createProxy(ERC20, {
      contractName: "StandaloneERC20",
      packageName: "openzeppelin-eth",
    });
    const result = await proxy.totalSupply();
    result.toNumber().should.eq(0);
  });
});
