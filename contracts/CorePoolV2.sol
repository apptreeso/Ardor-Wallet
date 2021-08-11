// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./VaultRecipient.sol";
import "hardhat/console.sol";

contract CorePoolV2 is ERC721, ReentrancyGuard, VaultRecipient {}
