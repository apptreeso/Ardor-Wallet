// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import { V2Migrator } from "./base/PoolBase.sol";
import { VaultRecipient } from "./base/VaultRecipient.sol";

contract CorePool is V2Migrator, VaultRecipient {}
