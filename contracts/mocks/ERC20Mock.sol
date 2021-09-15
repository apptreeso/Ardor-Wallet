// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev simple ERC20 mock contract
 *
 * @notice used by tests
 */
contract ERC20Mock is ERC20 {
    /// @dev allows minting `_supply` number of tokens on constructor
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _supply
    ) ERC20(_name, _symbol) {
        _mint(msg.sender, _supply);
    }
}
