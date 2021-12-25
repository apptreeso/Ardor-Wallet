// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { BitMaps } from "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import { MerkleProof } from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import { V2Migrator } from "./base/V2Migrator.sol";
import { ErrorHandler } from "./libraries/ErrorHandler.sol";
import { Stake } from "./libraries/Stake.sol";
import { IFactory } from "./interfaces/IFactory.sol";
import { ICorePool } from "./interfaces/ICorePool.sol";
import { ICorePoolV1 } from "./interfaces/ICorePoolV1.sol";
import { SushiLPPool } from "./SushiLPPool.sol";

/**
 * @title ILV Pool
 *
 * @dev ILV Pool contract to be deployed, with all base contracts inherited.
 * @dev Extends functionality working as a router to SushiLP Pool and deployed flash pools.
 *      through functions like `claimYieldRewardsMultiple()` and `claimVaultRewardsMultiple()`,
 *      ILV Pool is trusted by other pools and verified by the factory to aggregate functions
 *      and add quality of life features for stakers.
 */
contract ILVPool is V2Migrator {
    using ErrorHandler for bytes4;
    using Stake for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using BitMaps for BitMaps.BitMap;

    /// @dev stores merkle root related to users yield weight in v1.
    bytes32 public merkleRoot;

    BitMaps.BitMap private _usersMigrated;

    /// @dev maps `keccak256(userAddress,stakeId)` to a bool value that tells
    ///      if a v1 yield has already been minted by v2 contract.
    mapping(address => mapping(uint256 => bool)) public v1YieldMinted;

    /**
     * @dev logs `mintV1Yield()`.
     *
     * @param from user address
     * @param value number of ILV tokens minted
     *
     */
    event LogV1YieldMintedMultiple(address indexed from, uint256 value);

    /// @dev Calls `__V2Migrator_init()`.
    function initialize(
        address _ilv,
        address _silv,
        address _poolToken,
        address _factory,
        uint64 _initTime,
        uint32 _weight,
        address _corePoolV1,
        uint256 _v1StakeMaxPeriod
    ) external initializer {
        __V2Migrator_init(_ilv, _silv, _poolToken, _corePoolV1, _factory, _initTime, _weight, _v1StakeMaxPeriod);
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
     * @dev Executed by other core pools and flash pools
     *      as part of yield rewards processing logic (`_claimYieldRewards()` function).
     * @dev Executed when _useSILV is false and pool is not an ILV pool -
     *      see `CorePool._processRewards()`.
     *
     * @param _staker an address which stakes (the yield reward)
     * @param _value amount to be staked (yield reward amount)
     */
    function stakeAsPool(address _staker, uint256 _value) external nonReentrant {
        _sync();
        _requireNotPaused();
        ILVPool(this).stakeAsPool.selector.verifyAccess(factory.poolExists(msg.sender));
        User storage user = users[_staker];
        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);
        if (user.totalWeight > 0 || v1WeightToAdd > 0) {
            _processRewards(_staker, v1WeightToAdd, subYieldRewards, subVaultRewards);
        }
        uint256 stakeWeight = _value * Stake.YIELD_STAKE_WEIGHT_MULTIPLIER;
        Stake.Data memory newStake = Stake.Data({
            value: uint120(_value),
            lockedFrom: uint64(_now256()),
            lockedUntil: uint64(_now256() + Stake.MAX_STAKE_PERIOD),
            isYield: true
        });

        user.totalWeight += uint248(stakeWeight);
        user.stakes.push(newStake);

        globalWeight += stakeWeight;

        // gas savings
        uint256 userTotalWeight = (user.totalWeight + v1WeightToAdd);

        user.subYieldRewards = userTotalWeight.weightToReward(yieldRewardsPerWeight);
        user.subVaultRewards = userTotalWeight.weightToReward(vaultRewardsPerWeight);

        // update `poolTokenReserve` only if this is a LP Core Pool (stakeAsPool can be executed only for LP pool)
        poolTokenReserve += _value;

        emit LogStake(
            msg.sender,
            _staker,
            (user.stakes.length - 1),
            _value,
            uint64(_now256() + Stake.MAX_STAKE_PERIOD)
        );
    }

    /**
     * @dev Calls internal `_migrateLockedStakes` and _`migrateYieldWeights`
     *      functions for a complete migration of a v1 user to v2.
     * @dev See `_migrateLockedStakes` and _`migrateYieldWeights`.
     */
    function executeMigration(
        bytes32[] calldata _proof,
        uint256 _index,
        uint248 _yieldWeight,
        uint256[] calldata _stakeIds
    ) external {
        _sync();
        User storage user = users[msg.sender];
        _requireNotPaused();

        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);
        if (user.totalWeight > 0 || v1WeightToAdd > 0) {
            // update user state
            _processRewards(msg.sender, v1WeightToAdd, subYieldRewards, subVaultRewards);
        }
        _migrateLockedStakes(_stakeIds);
        if (_yieldWeight > 0) {
            _migrateYieldWeights(_proof, _index, _yieldWeight);
        }

        // gas savings
        uint256 userTotalWeight = (user.totalWeight + v1WeightToAdd);

        // resets all rewards after migration
        user.subYieldRewards = userTotalWeight.weightToReward(yieldRewardsPerWeight);
        user.subVaultRewards = userTotalWeight.weightToReward(vaultRewardsPerWeight);
    }

    /**
     * @dev Calls multiple pools claimYieldRewardsFromRouter() in order to claim yield
     * in 1 transaction.
     *
     * @notice ILV pool works as a router for claiming multiple pools registered
     *         in the factory.
     *
     * @param _pools array of pool addresses
     * @param _useSILV array of bool values telling if the pool should claim reward
     *                 as ILV or sILV
     */
    function claimYieldRewardsMultiple(address[] calldata _pools, bool[] calldata _useSILV) external {
        _sync();
        _requireNotPaused();

        // we're using selector to simplify input and access validation
        bytes4 fnSelector = ILVPool(address(this)).claimYieldRewardsMultiple.selector;

        fnSelector.verifyInput(_pools.length == _useSILV.length, 0);
        for (uint256 i = 0; i < _pools.length; i++) {
            address pool = _pools[i];
            fnSelector.verifyAccess(IFactory(factory).poolExists(pool));

            if (ICorePool(pool).poolToken() == ilv) {
                _claimYieldRewards(msg.sender, _useSILV[i]);
            } else {
                SushiLPPool(pool).claimYieldRewardsFromRouter(msg.sender, _useSILV[i]);
            }
        }
    }

    /**
     * @dev Calls multiple pools claimVaultRewardsFromRouter() in order to claim yield
     * in 1 transaction.
     *
     * @notice ILV pool works as a router for claiming multiple pools registered
     *         in the factory
     *
     * @param _pools array of pool addresses
     */
    function claimVaultRewardsMultiple(address[] calldata _pools) external {
        _sync();
        _requireNotPaused();
        for (uint256 i = 0; i < _pools.length; i++) {
            address pool = _pools[i];

            // we're using selector to simplify input and state validation
            bytes4(ILVPool(address(this)).claimVaultRewardsMultiple.selector).verifyAccess(
                IFactory(factory).poolExists(pool)
            );

            if (ICorePool(pool).poolToken() == ilv) {
                _claimVaultRewards(msg.sender);
            } else {
                SushiLPPool(pool).claimVaultRewardsFromRouter(msg.sender);
            }
        }
    }

    /**
     * @dev Aggregates in one single mint call multiple yield stakeIds from v1.
     * @dev reads v1 ILV pool to execute checks, if everything is correct, it stores
     *      in memory total amount of yield to be minted and calls the PoolFactory to mint
     *      it to msg.sender.
     *
     * @param _stakeIds array of yield ids in v1 from msg.sender user
     */
    function mintV1YieldMultiple(uint256[] calldata _stakeIds) external {
        _sync();
        User storage user = users[msg.sender];
        uint256 amountToMint;
        uint256 weightToRemove;

        // we're using selector to simplify input and state validation
        bytes4 fnSelector = ILVPool(this).mintV1YieldMultiple.selector;

        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);
        if (user.totalWeight > 0 || v1WeightToAdd > 0) {
            _processRewards(msg.sender, v1WeightToAdd, subYieldRewards, subVaultRewards);
        }

        for (uint256 i = 0; i < _stakeIds.length; i++) {
            uint256 _stakeId = _stakeIds[i];
            (uint256 tokenAmount, uint256 _weight, , uint64 lockedUntil, bool isYield) = ICorePoolV1(corePoolV1)
                .getDeposit(msg.sender, _stakeId);
            fnSelector.verifyState(isYield, i * 3);
            fnSelector.verifyState(_now256() > lockedUntil, i * 3 + 1);
            fnSelector.verifyState(!v1YieldMinted[msg.sender][_stakeId], i * 3 + 2);

            v1YieldMinted[msg.sender][_stakeId] = true;
            amountToMint += tokenAmount;
            weightToRemove += _weight;
        }
        user.totalWeight -= uint248(weightToRemove);

        // gas savings
        uint256 userTotalWeight = (user.totalWeight + v1WeightToAdd);

        // resets all rewards after migration
        user.subYieldRewards = userTotalWeight.weightToReward(yieldRewardsPerWeight);
        user.subVaultRewards = userTotalWeight.weightToReward(vaultRewardsPerWeight);
        factory.mintYieldTo(msg.sender, amountToMint, false);

        emit LogV1YieldMintedMultiple(msg.sender, amountToMint);
    }

    /**
     * @dev Verifies a proof from the yield weights merkle, and if it's valid,
     *      adds the v1 user yield weight to the v2 `user.totalWeight`.
     * @dev The yield weights merkle tree will be published after the initial contracts
     *      deployment, and then the merkle root is added through `setMerkleRoot` function.
     *
     * @param _proof bytes32 array with the proof generated off-chain
     * @param _index user index in the merkle tree
     * @param _yieldWeight user yield weight in v1 stored by the merkle tree
     */
    function _migrateYieldWeights(
        bytes32[] calldata _proof,
        uint256 _index,
        uint256 _yieldWeight
    ) private {
        User storage user = users[msg.sender];
        // bytes4(keccak256("_migrateYieldWeights(bytes32[],uint256,uint256")))
        bytes4 fnSelector = 0x660e5908;

        fnSelector.verifyAccess(!hasMigratedYield(_index));
        // compute leaf and verify merkle proof
        bytes32 leaf = keccak256(abi.encodePacked(_index, msg.sender, _yieldWeight));
        fnSelector.verifyInput(MerkleProof.verify(_proof, merkleRoot, leaf), 0);

        user.totalWeight += uint248(_yieldWeight);
        // set user as claimed in bitmap
        _usersMigrated.set(_index);
    }
}
