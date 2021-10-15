// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IFactory } from "../interfaces/IFactory.sol";

abstract contract FactoryControlled is Initializable {
    /// @dev Link to the pool factory IlluviumPoolFactory instance
    IFactory public factory;

    function __FactoryControlled_init(address _factory) internal initializer {
        // verify PoolFactory instance supplied
        require(
            IFactory(_factory).FACTORY_UID() == 0xc5cfd88c6e4d7e5c8a03c255f03af23c0918d8e82cac196f57466af3fd4a5ec7,
            "unexpected FACTORY_UID"
        );

        factory = IFactory(_factory);
    }

    modifier onlyFactoryController() {
        require(msg.sender == factory.owner(), "Unauthorized");
        _;
    }
}
