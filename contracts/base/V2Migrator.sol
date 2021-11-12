// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { ICorePoolV1 } from "../interfaces/ICorePoolV1.sol";
import { ErrorHandler } from "../libraries/ErrorHandler.sol";
import { Stake } from "../libraries/Stake.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { BitMaps } from "@openzeppelin/contracts/utils/structs/BitMaps.sol";
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
    using BitMaps for BitMaps.BitMap;

    /// @dev stores maximum timestamp of a v1 stake accepted in v2.
    uint256 public v1StakeMaxPeriod;

    /// @dev stores merkle root related to users yield weight in v1.
    bytes32 public merkleRoot;

    BitMaps.BitMap private _usersMigrated;

    /**
     * @dev logs `migrateFromV1()`
     *
     * @param from user address
     * @param yieldWeightMigrated total amount of weight coming from yield in v1
     * @param totalV1WeightAdded total amount of weight coming from locked stakes in v1
     *
     */
    event LogMigrateFromV1(address indexed from, uint256 yieldWeightMigrated, uint256 totalV1WeightAdded);

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
     * @dev Sets the yield weight tree root.
     *
     * @param _merkleRoot 32 bytes tree root.
     */
    function setMerkleRoot(bytes32 _merkleRoot) external {
        _requireIsFactoryController();
        merkleRoot = _merkleRoot;
    }

    /**
     * @dev Returns whether an user of a given _index in the bitmap has already
     *      migrated v1 yield weight stored in the merkle tree or not.
     *
     * @param _index user index in the bitmap, can be checked in the off-chain
     *               merkle tree
     * @return whether user has already migrated yield weights or not
     */
    function hasMigratedYield(uint256 _index) public view returns (bool) {
        return _usersMigrated.get(_index);
    }

    /**
     * @dev Reads v1 core pool locked stakes data (by looping through the `_stakeIds` array),
     *      checks if it's a valid v1 stake to migrate and save the id to v2 user struct.
     *
     * @dev Only `msg.sender` can migrate v1 stakes to v2.
     *
     * @param _yieldWeight total amount of yield weight in v1 stored in the users
     *                     merkle tree
     * @param _stakeIds array of v1 stake ids
     */
    function migrateFromV1(
        bytes32[] calldata _proof,
        uint256 _index,
        uint248 _yieldWeight,
        uint256[] calldata _stakeIds
    ) external {
        _requireNotPaused();
        User storage user = users[msg.sender];
        // we're using selector to simplify input and state validation
        bytes4 fnSelector = V2Migrator(this).migrateFromV1.selector;

        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);
        // update user state
        _processRewards(msg.sender, v1WeightToAdd, subYieldRewards, subVaultRewards);

        // checks if user is migrating yield weights
        if (_yieldWeight != 0) {
            fnSelector.verifyAccess(!hasMigratedYield(_index));

            // compute leaf and verify merkle proof
            bytes32 leaf = keccak256(abi.encodePacked(_index, msg.sender, _yieldWeight));
            MerkleProof.verify(_proof, merkleRoot, leaf);

            user.totalWeight += _yieldWeight;
            // set user as claimed in bitmap
            _usersMigrated.set(_index);
        }

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
        uint256 userTotalWeight = (user.totalWeight + v1WeightToAdd);

        // resets all rewards after migration
        user.subYieldRewards = userTotalWeight.weightToReward(yieldRewardsPerWeight);
        user.subVaultRewards = userTotalWeight.weightToReward(vaultRewardsPerWeight);

        // emit an event
        emit LogMigrateFromV1(msg.sender, _yieldWeight, totalV1WeightAdded);
    }
}
