// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { CorePool } from "./base/CorePool.sol";
import { Stake } from "./libraries/Stake.sol";
import { IFactory } from "./interfaces/IFactory.sol";
import { ICorePool } from "./interfaces/ICorePool.sol";

contract ILVPool is CorePool {
    event LogClaimRewardsMultiple(address indexed from, address[] pools, bool[] useSILV);
    event LogStakeAsPool(address indexed from, address indexed staker, uint256 value);

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
     *      as part of yield rewards processing logic (`_claimRewards` function)
     * @dev Executed when _useSILV is false and pool is not an ILV pool - see `IlluviumPoolBase._processRewards`
     *
     * @param _staker an address which stakes (the yield reward)
     * @param _value amount to be staked (yield reward amount)
     */
    function stakeAsPool(address _staker, uint256 _value) external updatePool {
        require(factory.poolExists(msg.sender), "access denied");
        User storage user = users[_staker];
        if (user.totalWeight > 0) {
            _processRewards(_staker);
        }
        uint256 stakeWeight = _value * YEAR_STAKE_WEIGHT_MULTIPLIER;
        Stake.Data memory newStake = Stake.Data({
            value: _value,
            lockedFrom: uint64(_now256()),
            lockedUntil: uint64(_now256() + 365 days),
            isYield: true
        });

        user.totalWeight += stakeWeight;
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
     * @dev calls multiple pools claimRewardsFromRouter() in order to claim yield
     * in 1 transaction.
     *
     * @notice ILV pool works as a router for claiming multiple pools registered
     *         in the factory
     *
     * @param _pools array of pool addresses
     * @param _useSILV array of bool values telling if the pool should claim reward
     *                 as ILV or sILV
     */
    function claimRewardsMultiple(address[] calldata _pools, bool[] calldata _useSILV) external {
        require(_pools.length == _useSILV.length, "invalid parameters");
        for (uint256 i = 0; i < _pools.length; i++) {
            address pool = _pools[i];
            require(IFactory(factory).poolExists(pool), "invalid pool");

            if (ICorePool(pool).poolToken() == ilv) {
                _claimRewards(msg.sender, _useSILV[i]);
            } else {
                ICorePool(pool).claimRewardsFromRouter(msg.sender, _useSILV[i]);
            }
        }

        emit LogClaimRewardsMultiple(msg.sender, _pools, _useSILV);
    }

    /// @notice not necessary for ILV pool because we claim internally in claimRewardsMultiple()
    function claimRewardsFromRouter(address _staker, bool _useSILV) external override {}
}
