// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { CorePool } from "./base/CorePool.sol";
import { Stake } from "./libraries/Stake.sol";
import { IFactory } from "./interfaces/IFactory.sol";
import { ICorePool } from "./interfaces/ICorePool.sol";

contract ILVPool is CorePool {
    event LogClaimYieldRewardsMultiple(address indexed from, address[] pools, bool[] useSILV);
    event LogStakeAsPool(address indexed from, address indexed staker, uint256 value);
    event LogMigrateWeights(address indexed by, uint256 numberOfUsers, uint248 totalWeight);

    /// @dev see __ICorePool_init
    function __ILVPool_init(
        address _ilv,
        address _silv,
        address _poolToken,
        address _factory,
        uint64 _initTime,
        uint32 _weight
    ) external initializer {
        __CorePool_init(_ilv, _silv, _poolToken, _factory, _initTime, _weight);
    }

    /**
     * @dev Executed by other core pools and flash pools
     *      as part of yield rewards processing logic (`_claimYieldRewards` function)
     * @dev Executed when _useSILV is false and pool is not an ILV pool - see `IlluviumPoolBase._processRewards`
     *
     * @param _staker an address which stakes (the yield reward)
     * @param _value amount to be staked (yield reward amount)
     */
    function stakeAsPool(address _staker, uint256 _value) external updatePool whenNotPaused nonReentrant {
        require(factory.poolExists(msg.sender), "access denied");
        User storage user = users[_staker];
        if (user.totalWeight > 0) {
            _processRewards(_staker);
        }
        uint256 stakeWeight = _value * YEAR_STAKE_WEIGHT_MULTIPLIER;
        Stake.Data memory newStake = Stake.Data({
            value: uint120(_value),
            lockedFrom: uint64(_now256()),
            lockedUntil: uint64(_now256() + 365 days),
            isYield: true
        });

        user.totalWeight += uint248(stakeWeight);
        user.stakes.push(newStake);

        globalWeight += stakeWeight;

        // gas savings
        uint256 userTotalWeight = user.totalWeight;

        user.subYieldRewards = _weightToReward(userTotalWeight, yieldRewardsPerWeight);
        user.subVaultRewards = _weightToReward(userTotalWeight, vaultRewardsPerWeight);

        // update `poolTokenReserve` only if this is a LP Core Pool (stakeAsPool can be executed only for LP pool)
        poolTokenReserve += _value;

        emit LogStakeAsPool(msg.sender, _staker, _value);
    }

    /**
     * @dev calls multiple pools claimYieldRewardsFromRouter() in order to claim yield
     * in 1 transaction.
     *
     * @notice ILV pool works as a router for claiming multiple pools registered
     *         in the factory
     *
     * @param _pools array of pool addresses
     * @param _useSILV array of bool values telling if the pool should claim reward
     *                 as ILV or sILV
     */
    function claimYieldRewardsMultiple(address[] calldata _pools, bool[] calldata _useSILV)
        external
        updatePool
        whenNotPaused
    {
        require(_pools.length == _useSILV.length, "invalid parameters");
        for (uint256 i = 0; i < _pools.length; i++) {
            address pool = _pools[i];
            require(IFactory(factory).poolExists(pool), "invalid pool");

            if (ICorePool(pool).poolToken() == ilv) {
                _claimYieldRewards(msg.sender, _useSILV[i]);
            } else {
                ICorePool(pool).claimYieldRewardsFromRouter(msg.sender, _useSILV[i]);
            }
        }

        emit LogClaimYieldRewardsMultiple(msg.sender, _pools, _useSILV);
    }

    /**
     * @notice can be called only by the factory controller
     * @notice the purpose of this function is to migrate yield weights from v1
     *         in 1 single operation per user so we don't need to store each v1 yield
     *         staked. `mintV1Yield()` function is used to mint v1 yield in v2 instead of using
     *         v1 unstake function.
     *
     * @dev adds weight to an address according to how much weight the user
     *      had in yield accumulated in staking v1.
     *
     * @param _users an array of v1 users addresses
     * @param _yieldWeights an array of v1 yield weights to be added to users
     * @param _totalWeight total value of weight to be migrated
     */
    function migrateWeights(
        address[] calldata _users,
        uint248[] calldata _yieldWeights,
        uint248 _totalWeight
    ) external onlyFactoryController {
        // checks if parameters are valid
        require(_users.length == _yieldWeights.length, "invalid parameters");

        // will be used to check if weights were added as expected
        uint248 totalWeight;

        // checks each weight at `_yieldWeights` array and adds to v2 user
        for (uint256 i = 0; i < _users.length; i++) {
            User storage user = users[_users[i]];
            user.totalWeight += _yieldWeights[i];

            totalWeight += _yieldWeights[i];
        }

        // makes sure total weight migrated is valid
        assert(totalWeight == _totalWeight);

        // emits an event
        emit LogMigrateWeights(msg.sender, _users.length, totalWeight);
    }

    /// @notice not necessary for ILV pool because we claim internally in claimYieldRewardsMultiple()
    function claimYieldRewardsFromRouter(address _staker, bool _useSILV) external override {}

    /// @notice not necessary for ILV pool because we claim internally in claimVaultRewardsMultiple()
    function claimVaultRewardsFromRouter(address _staker, bool _useSILV) external override {}
}
