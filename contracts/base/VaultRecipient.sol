// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

abstract contract VaultRecipient {
    address public vault;

    modifier onlyVault() {
        require(msg.sender == vault, "Unauthorized");
        _;
    }
}
