// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IFactory } from "../interfaces/IFactory.sol";

abstract contract FactoryControlled is Initializable {
    /// @dev Link to the pool factory IlluviumPoolFactory instance
    IFactory public factory;

    function __FactoryControlled_init(address _factory) internal initializer {
        require(_factory != address(0));

        factory = IFactory(_factory);
    }

    modifier onlyFactoryController() {
        require(msg.sender == factory.owner(), "Unauthorized");
        _;
    }
}
