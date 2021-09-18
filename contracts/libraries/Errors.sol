// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

library Errors {
    error ZeroInput(bytes4 fnSelector, uint8 paramIndex);
    error InvalidInput(bytes4 fnSelector, uint8 paramIndex);
    error InvalidState(bytes4 fnSelector, uint256 errorCode);
    error AccessDenied(bytes4 fnSelector, address addr);

    function validateNonZeroInput(
        bytes4 fnSelector,
        uint256 value,
        uint8 paramIndex
    ) internal pure {
        if (value == 0) {
            revert ZeroInput(fnSelector, paramIndex);
        }
    }

    function validateInput(
        bytes4 fnSelector,
        bool expr,
        uint8 paramIndex
    ) internal pure {
        if (!expr) {
            revert InvalidInput(fnSelector, paramIndex);
        }
    }

    function validateState(
        bytes4 fnSelector,
        bool expr,
        uint256 errorCode
    ) internal pure {
        if (!expr) {
            revert InvalidState(fnSelector, errorCode);
        }
    }

    function validateAccess(bytes4 fnSelector, bool expr) internal view {
        if (!expr) {
            revert AccessDenied(fnSelector, msg.sender);
        }
    }
}
