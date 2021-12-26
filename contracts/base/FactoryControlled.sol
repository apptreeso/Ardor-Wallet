// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IFactory } from "../interfaces/IFactory.sol";

/**
 * @title FactoryControlled
 *
 * @dev Abstract smart contract responsible to hold IFactory factory address.
 * @dev Stores PoolFactory address on initialization.
 *
 */
abstract contract FactoryControlled is Initializable {
    /// @dev Link to the pool factory IlluviumPoolFactory instance.
    IFactory internal _factory;

    /// @dev Attachs PoolFactory address to the FactoryControlled contract.
    function __FactoryControlled_init(address factory_) internal initializer {
        require(factory_ != address(0));

        _factory = IFactory(factory_);
    }

    /// @dev checks if caller is factory admin (eDAO multisig address).
    function _requireIsFactoryController() internal view {
        require(msg.sender == _factory.owner());
    }
}
