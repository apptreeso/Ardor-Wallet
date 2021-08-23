// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { V2Migrator } from "./base/V2Migrator.sol";
import { VaultRecipient } from "./base/VaultRecipient.sol";

contract CorePool is V2Migrator, VaultRecipient {}
