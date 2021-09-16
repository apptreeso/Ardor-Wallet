// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

library Errors {
    error ZeroInput(uint8 index);
    error InvalidInput(uint8 index);
    error InvalidState(uint256 code);
    error AccessDenied(address addr);

    function nonZeroAt(uint256 value, uint8 index) internal pure {
        if (value == 0) {
            revert ZeroInput(index);
        }
    }

    function invalidAt(bool expr, uint8 index) internal pure {
        if (!expr) {
            revert InvalidInput(index);
        }
    }

    function invalid(bool expr, uint256 code) internal pure {
        if (!expr) {
            revert InvalidState(code);
        }
    }

    function invalidAccess(bool expr) internal view {
        if (!expr) {
            revert AccessDenied(msg.sender);
        }
    }
}
