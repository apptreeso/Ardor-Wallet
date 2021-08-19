// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

/// @title Function for getting block timestamp
/// @dev Base contract that is overridden for tests
abstract contract Timestamp {
    /**
     * @dev Testing time-dependent functionality is difficult and the best way of
     *      doing it is to override time in helper test smart contracts
     *
     * @return `block.timestamp` in mainnet, custom values in testnets (if overridden)
     */
    function _now256() internal view virtual returns (uint256) {
        // return current block timestamp
        return block.timestamp;
    }
}
