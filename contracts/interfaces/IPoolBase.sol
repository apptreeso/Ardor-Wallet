// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { Stake } from "../libraries/Stake.sol";

interface IPoolBase {
    /// @dev Data structure representing token holder using a pool
    struct User {
        /// @dev Total staked amount in flexible mode
        uint256 flexibleTokenAmount;
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

    function getDeposit(address _user, uint256 _depositId) external view returns (Stake memory);

    function getDepositsLength(address _user) external view returns (uint256);

    function stake(
        uint256 _amount,
        uint64 _lockedUntil,
        bool useSILV
    ) external;

    function unstake(
        uint256 _depositId,
        uint256 _amount,
        bool useSILV
    ) external;

    function sync() external;

    function processRewards(bool useSILV) external;

    function setWeight(uint32 _weight) external;
}
