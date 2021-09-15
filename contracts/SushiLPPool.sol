// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { V2Migrator } from "./base/V2Migrator.sol";

contract SushiLPPool is V2Migrator {
    /// @dev see __V2Migrator_init()
    function initialize(
        address _ilv,
        address _silv,
        address _poolToken,
        address _factory,
        uint64 _initTime,
        uint32 _weight,
        address _corePoolV1,
        uint256 _v1StakeMaxPeriod
    ) external initializer {
        __V2Migrator_init(_ilv, _silv, _poolToken, _factory, _initTime, _weight, _corePoolV1, _v1StakeMaxPeriod);
    }
}
