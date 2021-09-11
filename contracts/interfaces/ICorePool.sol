// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { Stake } from "../libraries/Stake.sol";

interface ICorePool {
    /// @dev Data structure representing token holder using a pool
    struct User {
        /// @dev Total staked amount in flexible mode
        uint128 flexibleBalance;
        /// @dev pending yield rewards to be claimed
        uint128 pendingYield;
        /// @dev pending revenue distribution to be claimed
        uint128 pendingRevDis;
        /// @dev Total weight
        uint248 totalWeight;
        /// @dev number of v1StakesIds
        uint8 v1IdsLength;
        /// @dev Auxiliary variable for yield calculation
        uint256 subYieldRewards;
        /// @dev Auxiliary variable for vault rewards calculation
        uint256 subVaultRewards;
        /// @dev An array of holder's stakes
        Stake.Data[] stakes;
        /// @dev A mapping of holder's stakes ids in V1
        mapping(uint256 => uint256) v1StakesIds;
    }

    function users(address _user)
        external
        view
        returns (
            uint128,
            uint128,
            uint128,
            uint248,
            uint8,
            uint256,
            uint256
        );

    function silv() external view returns (address);

    function poolToken() external view returns (address);

    function isFlashPool() external view returns (bool);

    function weight() external view returns (uint32);

    function lastYieldDistribution() external view returns (uint64);

    function yieldRewardsPerWeight() external view returns (uint256);

    function globalWeight() external view returns (uint256);

    function pendingRewards(address _user) external view returns (uint256, uint256);

    function poolTokenReserve() external view returns (uint256);

    function claimYieldRewardsFromRouter(address _staker, bool _useSILV) external;

    function claimVaultRewardsFromRouter(address _staker, bool _useSILV) external;

    function balanceOf(address _user) external view returns (uint256);

    function getStake(address _user, uint256 _stakeId) external view returns (Stake.Data memory);

    function getStakesLength(address _user) external view returns (uint256);

    function sync() external;

    function setWeight(uint32 _weight) external;

    function receiveVaultRewards(uint256 value) external;
}
