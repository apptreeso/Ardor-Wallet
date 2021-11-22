// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { ICorePoolV1 } from "../interfaces/ICorePoolV1.sol";
import { ErrorHandler } from "../libraries/ErrorHandler.sol";
import { Stake } from "../libraries/Stake.sol";
import { CorePool } from "./CorePool.sol";

/**
 * @title V2Migrator
 *
 * @dev V2Migrator inherits all CorePool base contract functionaltiy, and adds
 *      v1 to v2 migration related functions. This is a core smart contract of
 *      Sushi LP and ILV pools, and manages users locked and yield weights coming
 *      from v1.
 * @dev Parameters need to be reviewed carefully before deployment for the migration process.
 * @dev Users will migrate their locked stakes, which are stored in the contract,
 *      and v1 total yield weights by data stored in a merkle tree using merkle proofs.
 */
abstract contract V2Migrator is CorePool {
    using ErrorHandler for bytes4;
    using Stake for uint256;

    /// @dev stores maximum timestamp of a v1 stake accepted in v2.
    uint256 public v1StakeMaxPeriod;

    /**
     * @dev logs `_migrateYieldWeights()`
     *
     * @param from user address
     * @param yieldWeightMigrated total amount of weight coming from yield in v1
     *
     */
    event LogMigrateYieldWeight(address indexed from, uint256 yieldWeightMigrated);

    /**
     * @dev logs `_migrateLockedStakes()`
     *
     * @param from user address
     * @param totalV1WeightAdded total amount of weight coming from locked stakes in v1
     *
     */
    event LogMigrateLockedStakes(address indexed from, uint256 totalV1WeightAdded);

    /**
     * @dev V2Migrator initializer function
     *
     * @param _v1StakeMaxPeriod max timestamp that we accept _lockedFrom values
     *                         in v1 stakes
     */
    function __V2Migrator_init(
        address _ilv,
        address _silv,
        address _poolToken,
        address _corePoolV1,
        address _factory,
        uint64 _initTime,
        uint32 _weight,
        uint256 _v1StakeMaxPeriod
    ) internal initializer {
        __CorePool_init(_ilv, _silv, _poolToken, _corePoolV1, _factory, _initTime, _weight);

        v1StakeMaxPeriod = _v1StakeMaxPeriod;
    }

    /**
     * @dev External migrateLockedStakes call, used in Sushi LP pool.
     *
     * @param _stakeIds array of v1 stake ids
     */
    function migrateLockedStakes(uint256[] calldata _stakeIds) external {
        _requireNotPaused();

        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);
        // update user state
        _processRewards(msg.sender, v1WeightToAdd, subYieldRewards, subVaultRewards);
        _migrateLockedStakes(_stakeIds, v1WeightToAdd);
    }

    /**
     * @dev Reads v1 core pool locked stakes data (by looping through the `_stakeIds` array),
     *      checks if it's a valid v1 stake to migrate and save the id to v2 user struct.
     *
     * @dev Only `msg.sender` can migrate v1 stakes to v2.
     *
     * @param _stakeIds array of v1 stake ids
     */
    function _migrateLockedStakes(uint256[] calldata _stakeIds, uint256 _v1WeightToAdd) internal {
        User storage user = users[msg.sender];

        // we're using selector to simplify input and state validation
        bytes4 fnSelector = 0x710276c7;

        uint256 totalV1WeightAdded;

        for (uint256 i = 0; i < _stakeIds.length; i++) {
            (, uint256 _weight, uint64 lockedFrom, , bool isYield) = ICorePoolV1(corePoolV1).getDeposit(
                msg.sender,
                _stakeIds[i]
            );
            fnSelector.verifyState(lockedFrom <= v1StakeMaxPeriod, i * 3);
            fnSelector.verifyState(lockedFrom > 0 && !isYield, i * 3 + 1);
            fnSelector.verifyState(v1StakesWeights[msg.sender][_stakeIds[i]] == 0, i * 3 + 2);

            v1StakesWeights[msg.sender][_stakeIds[i]] = _weight;
            v1StakesWeightsOriginal[msg.sender][_stakeIds[i]] = _weight;
            totalV1WeightAdded += _weight;
            user.v1IdsLength++;
            user.v1StakesIds[i] = _stakeIds[i];
        }

        // gas savings
        uint256 userTotalWeight = (user.totalWeight + _v1WeightToAdd);

        // resets all rewards after migration
        user.subYieldRewards = userTotalWeight.weightToReward(yieldRewardsPerWeight);
        user.subVaultRewards = userTotalWeight.weightToReward(vaultRewardsPerWeight);
    }
}
