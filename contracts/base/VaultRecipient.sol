// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { FactoryControlled } from "./FactoryControlled.sol";
import { Errors } from "../libraries/Errors.sol";

abstract contract VaultRecipient is FactoryControlled {
    // err lib used on fn selectors
    using Errors for bytes4;

    /// @dev Link to deployed IlluviumVault instance
    address public vault;

    /// @dev Used to calculate vault rewards
    /// @dev This value is different from "reward per token" used in locked pool
    /// @dev Note: stakes are different in duration and "weight" reflects that
    uint256 public vaultRewardsPerWeight;

    /**
     * @dev Fired in setVault()
     *
     * @param by an address which executed the function, always a factory owner
     * @param previousVault previous vault contract address
     * @param newVault new vault address
     */
    event LogSetVault(address indexed by, address previousVault, address newVault);

    /**
     * @dev Executed only by the factory owner to Set the vault
     *
     * @param _vault an address of deployed IlluviumVault instance
     */
    function setVault(address _vault) external {
        // we're using selector to simplify input and state validation
        bytes4 fnSelector = VaultRecipient(this).setVault.selector;

        // verify function is executed by the factory owner
        fnSelector.verifyAccess(factory.owner() == msg.sender);

        // verify input is set
        fnSelector.verifyNonZeroInput(_vault, 0);

        // saves current vault to memory
        address previousVault = vault;

        // update vault address
        vault = _vault;

        // emit an event
        emit LogSetVault(msg.sender, previousVault, _vault);
    }
}
