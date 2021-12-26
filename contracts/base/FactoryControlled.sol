// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IFactory } from "../interfaces/IFactory.sol";
import { ErrorHandler } from "../libraries/ErrorHandler.sol";

/**
 * @title FactoryControlled
 *
 * @dev Abstract smart contract responsible to hold IFactory factory address.
 * @dev Stores PoolFactory address on initialization.
 *
 */
abstract contract FactoryControlled is Initializable {
    using ErrorHandler for bytes4;
    /// @dev Link to the pool factory IlluviumPoolFactory instance.
    IFactory internal _factory;

    /// @dev Attachs PoolFactory address to the FactoryControlled contract.
    function __FactoryControlled_init(address factory_) internal initializer {
        // we're using selector to simplify input and state validation
        // internal function simulated selector is `keccak256("__FactoryControlled_init(address)")`
        bytes4 fnSelector = 0xbb6c0dbf;
        fnSelector.verifyNonZeroInput(uint160(factory_), 0);

        _factory = IFactory(factory_);
    }

    /// @dev checks if caller is factory admin (eDAO multisig address).
    function _requireIsFactoryController() internal view {
        // we're using selector to simplify input and state validation
        // internal function simulated selector is `keccak256("_requireIsFactoryController()")`
        bytes4 fnSelector = 0x39e71deb;
        fnSelector.verifyAccess(msg.sender == _factory.owner());
    }
}
