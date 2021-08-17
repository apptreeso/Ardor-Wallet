// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import { PoolBase } from "./base/PoolBase.sol";
import { VaultRecipient } from "./base/VaultRecipient.sol";

contract CorePool is PoolBase, VaultRecipient {}
