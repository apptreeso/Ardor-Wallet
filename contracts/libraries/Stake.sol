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

    /**
     * @dev Stake weight is proportional to stake value and time locked, precisely
     *      "stake value wei multiplied by (fraction of the year locked plus one)"
     * @dev To avoid significant precision loss due to multiplication by "fraction of the year" [0, 1],
     *      weight is stored multiplied by 1e6 constant, as an integer
     * @dev Corner case 1: if time locked is zero, weight is stake value multiplied by 1e6
     * @dev Corner case 2: if time locked is one year, fraction of the year locked is one, and
     *      weight is a stake value multiplied by 2 * 1e6
     */
    uint256 internal constant WEIGHT_MULTIPLIER = 1e6;

    function weight(Data storage _self) internal view returns (uint256) {
        return
            uint256(
                (((_self.lockedUntil - _self.lockedFrom) * WEIGHT_MULTIPLIER) / 365 days + WEIGHT_MULTIPLIER) *
                    _self.value
            );
    }
}
