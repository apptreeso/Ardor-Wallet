// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import { SushiLPPool } from "../SushiLPPool.sol";

contract SushiLPPoolUpgrade is SushiLPPool {
    uint256 public now256;

    function newFunction(uint256 _a, uint256 _b) external pure returns (uint256) {
        return _a + _b;
    }

    function setNow256(uint256 __now256) external {
        now256 = __now256;
    }

    function _now256() internal view override returns (uint256) {
        return now256;
    }
}
