// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { V2Migrator } from "./base/V2Migrator.sol";

contract SushiLPPool is V2Migrator {
    /// @dev see __CorePool_init()
    function __SushiLPPool_init(
        address _ilv,
        address _silv,
        address _poolToken,
        address _factory,
        uint64 _initTime,
        uint32 _weight
    ) external initializer {
        __CorePool_init(_ilv, _silv, _poolToken, _factory, _initTime, _weight);
    }
}
