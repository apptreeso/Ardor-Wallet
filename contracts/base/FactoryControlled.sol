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
    IFactory public factory;

    /// @dev Attachs PoolFactory address to the FactoryControlled contract.
    function __FactoryControlled_init(address _factory) internal initializer {
        require(_factory != address(0));

        factory = IFactory(_factory);
    }

    /// @dev checks if caller is factory admin (eDAO multisig address).
    function _requireIsFactoryController() internal view {
        require(msg.sender == factory.owner());
    }
}
