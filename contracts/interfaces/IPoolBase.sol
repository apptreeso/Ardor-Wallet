// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { Stake } from "../libraries/Stake.sol";

interface IPoolBase {
    /// @dev Data structure representing token holder using a pool
    struct User {
        /// @dev Total staked amount in flexible mode
        uint128 flexibleTokenAmount;
        /// @dev pending yield rewards to be claimed
        uint128 pendingYield;
        /// @dev Total weight
        uint256 totalWeight;
        /// @dev Auxiliary variable for yield calculation
        uint256 subYieldRewards;
        /// @dev Auxiliary variable for vault rewards calculation
        uint256 subVaultRewards;
        /// @dev An array of holder's stakes
        Stake.Data[] stakes;
        /// @dev An array of holder's stakes in V1
        Stake.Data[] v1Stakes;
    }

    function users(address _user) external view returns (User memory);

    function silv() external view returns (address);

    function poolToken() external view returns (address);

    function isFlashPool() external view returns (bool);

    function weight() external view returns (uint32);

    function lastYieldDistribution() external view returns (uint64);

    function yieldRewardsPerWeight() external view returns (uint256);

    function globalWeight() external view returns (uint256);

    function pendingYieldRewards(address _user) external view returns (uint256);

    function balanceOf(address _user) external view returns (uint256);

    function getStake(address _user, uint256 _stakeId) external view returns (Stake memory);

    function getStakesLength(address _user) external view returns (uint256);

    function stake(
        uint256 _value,
        uint64 _lockedUntil,
        bool useSILV
    ) external;

    function unstake(
        uint256 _stakeId,
        uint256 _value,
        bool useSILV
    ) external;

    function sync() external;

    function processRewards(bool useSILV) external;

    function setWeight(uint32 _weight) external;
}
