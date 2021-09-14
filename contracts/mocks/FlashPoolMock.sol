// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import { FlashPool } from "../FlashPool.sol";

contract FlashPoolMock is FlashPool {
    uint256 public now256;

    function initialize(
        address _ilv,
        address _silv,
        address _poolToken,
        address _factory,
        uint64 _initTime,
        uint32 _weight
    ) external override initializer {
        require(_poolToken != address(0), "pool token address not set");
        require(_initTime > 0, "init time not set");
        require(_weight > 0, "pool weight not set");

        __FactoryControlled_init(_factory);
        __ReentrancyGuard_init();
        __Pausable_init();

        // save the inputs into internal state variables
        ilv = _ilv;
        silv = _silv;
        poolToken = _poolToken;
        weight = _weight;

        // init the dependent internal state variables
        lastYieldDistribution = _initTime;
    }

    function setNow256(uint256 __now256) external {
        now256 = __now256;
    }

    function _now256() internal view override returns (uint256) {
        return now256;
    }
}
