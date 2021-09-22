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

    /**
     * @dev Rewards per weight are stored multiplied by 1e12 as uint
     */
    uint256 internal constant REWARD_PER_WEIGHT_MULTIPLIER = 1e12;

    /**
     * @dev When we know beforehand that staking is done for a year, and fraction of the year locked is one,
     *      we use simplified calculation and use the following constant instead previous one
     */
    uint256 internal constant YEAR_STAKE_WEIGHT_MULTIPLIER = 2 * 1e6;

    /**
     * @dev Multiplier used as a bonus reward for v1 stakes
     */
    uint256 internal constant V1_WEIGHT_BONUS = 2;

    /**
     * @dev Multiplier used for normalizing V1 weight to V2 weight
     *
     * @notice in v2 contracts, in order to achieve same proportions in v1
     *         we need to multiply v1 weight by 1.5x
     */
    uint256 internal constant V1_WEIGHT_MULTIPLIER = 1500;

    function weight(Data storage _self) internal view returns (uint256) {
        return
            uint256(
                (((_self.lockedUntil - _self.lockedFrom) * WEIGHT_MULTIPLIER) / 730 days + WEIGHT_MULTIPLIER) *
                    _self.value
            );
    }

    /**
     * @dev Converts stake weight (not to be mixed with the pool weight) to
     *      ILV reward value, applying the 10^12 division on weight
     *
     * @param _weight stake weight
     * @param _rewardPerWeight ILV reward per weight
     * @return reward value normalized to 10^12
     */
    function weightToReward(uint256 _weight, uint256 _rewardPerWeight) internal pure returns (uint256) {
        // apply the formula and return
        return (_weight * _rewardPerWeight) / REWARD_PER_WEIGHT_MULTIPLIER;
    }

    /**
     * @dev Converts reward ILV value to stake weight (not to be mixed with the pool weight),
     *      applying the 10^12 multiplication on the reward
     *      - OR -
     * @dev Converts reward ILV value to reward/weight if stake weight is supplied as second
     *      function parameter instead of reward/weight
     *
     * @param _reward yield reward
     * @param _globalWeight total weight in the pool
     * @return reward per weight value
     */
    function rewardPerWeight(uint256 _reward, uint256 _globalWeight) internal pure returns (uint256) {
        // apply the reverse formula and return
        return (_reward * REWARD_PER_WEIGHT_MULTIPLIER) / _globalWeight;
    }
}
