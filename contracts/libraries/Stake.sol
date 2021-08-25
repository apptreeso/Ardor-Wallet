// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

library Stake {
    struct Data {
        /// @dev token amount staked
        uint120 value;
        /// @dev locking period - from
        uint64 lockedFrom;
        /// @dev locking period - until
        uint64 lockedUntil;
        /// @dev indicates if the stake was created as a yield reward
        bool isYield;
    }

    function weight(Data storage _self, uint256 weightMultiplier) internal view returns (uint256) {
        return
            uint256(
                (((_self.lockUntil - _self.lockFrom) * weightMultiplier) / 365 days + weightMultiplier) *
                    _self.tokenAmount
            );
    }
}
