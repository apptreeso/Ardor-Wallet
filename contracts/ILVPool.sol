// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { CorePool } from "./base/CorePool.sol";

contract ILVPool is CorePool {
    /// @dev see __ICorePool_init
    function __ILVPool_init(
        address _ilv,
        address _silv,
        address _poolToken,
        address _factory,
        uint64 _initTime,
        uint32 _weight
    ) internal initializer {
        __CorePool_init(_ilv, _silv, _poolToken, _factory, _initTime, _weight);
    }
}
