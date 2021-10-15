// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { IERC20, SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { V2Migrator } from "./base/V2Migrator.sol";
import { Errors } from "./libraries/Errors.sol";
import { Stake } from "./libraries/Stake.sol";
import { IFactory } from "./interfaces/IFactory.sol";
import { ICorePool } from "./interfaces/ICorePool.sol";
import { ICorePoolV1 } from "./interfaces/ICorePoolV1.sol";

contract ILVPool is V2Migrator {
    // err lib used on fn selectors
    using Errors for bytes4;
    using Stake for uint256;
    using SafeERC20 for IERC20;

    /// @dev maps `keccak256(userAddress,stakeId)` to a bool value that tells
    ///      if a v1 yield has already been minted by v2 contract
    mapping(address => mapping(uint256 => bool)) public v1YieldMinted;

    event LogClaimYieldRewardsMultiple(address indexed from, address[] pools, bool[] useSILV);
    event LogClaimVaultRewardsMultiple(address indexed from, address[] pool);
    event LogStakeAsPool(address indexed from, address indexed staker, uint256 value);
    event LogMigrateWeights(address indexed by, uint256 numberOfUsers, uint248 totalWeight);

    /**
     * @dev logs mintV1Yield()
     *
     * @param from user address
     * @param stakeId v1 yield id
     * @param value number of ILV tokens minted
     *
     */
    event LogV1YieldMinted(address indexed from, uint256 stakeId, uint256 value);

    /**
     * @dev logs mintV1Yield()
     *
     * @param from user address
     * @param stakeIds array of v1 yield ids
     * @param value number of ILV tokens minted
     *
     */
    event LogV1YieldMintedMultiple(address indexed from, uint256[] stakeIds, uint256 value);

    /// @dev see __V2Migrator_init
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
        __V2Migrator_init(_ilv, _silv, _poolToken, _factory, _initTime, _weight, _corePoolV1, _v1StakeMaxPeriod);
    }

    /**
     * @dev Executed by other core pools and flash pools
     *      as part of yield rewards processing logic (`_claimYieldRewards` function)
     * @dev Executed when _useSILV is false and pool is not an ILV pool - see `IlluviumPoolBase._processRewards`
     *
     * @param _staker an address which stakes (the yield reward)
     * @param _value amount to be staked (yield reward amount)
     */
    function stakeAsPool(address _staker, uint256 _value) external updatePool nonReentrant {
        // we're using selector to simplify input and access validation
        bytes4 fnSelector = ILVPool(this).stakeAsPool.selector;

        // check contract is not paused
        _requireNotPaused(fnSelector);

        // verify is accessed by the pool
        fnSelector.verifyAccess(factory.poolExists(msg.sender));

        User storage user = users[_staker];
        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);
        if (user.totalWeight > 0) {
            _processRewards(_staker, v1WeightToAdd, subYieldRewards, subVaultRewards);
        }
        uint256 stakeWeight = _value * Stake.YIELD_STAKE_WEIGHT_MULTIPLIER;
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
        uint256 userTotalWeight = (user.totalWeight + v1WeightToAdd);

        user.subYieldRewards = userTotalWeight.weightToReward(yieldRewardsPerWeight);
        user.subVaultRewards = userTotalWeight.weightToReward(vaultRewardsPerWeight);

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
    function claimYieldRewardsMultiple(address[] calldata _pools, bool[] calldata _useSILV) external updatePool {
        // we're using selector to simplify input and access validation
        bytes4 fnSelector = ILVPool(this).claimYieldRewardsMultiple.selector;

        // check contract is not paused
        _requireNotPaused(fnSelector);

        // verify the inputs
        fnSelector.verifyInput(_pools.length == _useSILV.length, 0);

        // do the claiming
        for (uint256 i = 0; i < _pools.length; i++) {
            address pool = _pools[i];
            fnSelector.verifyAccess(IFactory(factory).poolExists(pool));

            if (ICorePool(pool).poolToken() == ilv) {
                _claimYieldRewards(msg.sender, _useSILV[i]);
            } else {
                ICorePool(pool).claimYieldRewardsFromRouter(msg.sender, _useSILV[i]);
            }
        }

        emit LogClaimYieldRewardsMultiple(msg.sender, _pools, _useSILV);
    }

    /**
     * @dev calls multiple pools claimVaultRewardsFromRouter() in order to claim yield
     * in 1 transaction.
     *
     * @notice ILV pool works as a router for claiming multiple pools registered
     *         in the factory
     *
     * @param _pools array of pool addresses
     */
    function claimVaultRewardsMultiple(address[] calldata _pools) external updatePool {
        // we're using selector to simplify input and access validation
        bytes4 fnSelector = ILVPool(this).claimVaultRewardsMultiple.selector;
        // check contract is not paused
        _requireNotPaused(fnSelector);

        for (uint256 i = 0; i < _pools.length; i++) {
            address pool = _pools[i];

            // we're using selector to simplify input and state validation
            bytes4(fnSelector).verifyAccess(IFactory(factory).poolExists(pool));

            if (ICorePool(pool).poolToken() == ilv) {
                _claimVaultRewards(msg.sender);
            } else {
                ICorePool(pool).claimVaultRewardsFromRouter(msg.sender);
            }
        }

        emit LogClaimVaultRewardsMultiple(msg.sender, _pools);
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
    ) external {
        // verify is accessed only by the factory owner
        ILVPool(this).migrateWeights.selector.verifyAccess(msg.sender == factory.owner());
        // checks if parameters are valid
        ILVPool(this).migrateWeights.selector.verifyInput(_users.length == _yieldWeights.length, 0);

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

    /**
     * @dev reads v1 core pool yield data (using `_stakeId` and `msg.sender`),
     *      validates, mints ILV according to v1 data and stores a receipt hash
     *
     * @param _stakeId v1 yield id
     */
    function mintV1Yield(uint256 _stakeId) external {
        (uint256 tokenAmount, uint256 weight, , uint64 lockedUntil, bool isYield) = ICorePoolV1(corePoolV1).getDeposit(
            msg.sender,
            _stakeId
        );

        // we're using selector to simplify input and state validation
        bytes4 fnSelector = ILVPool(this).mintV1Yield.selector;

        fnSelector.verifyState(isYield, 0);
        fnSelector.verifyState(_now256() > lockedUntil, 1);
        fnSelector.verifyState(!v1YieldMinted[msg.sender][_stakeId], 2);

        users[msg.sender].totalWeight -= uint248(weight);
        v1YieldMinted[msg.sender][_stakeId] = true;
        factory.mintYieldTo(msg.sender, tokenAmount, false);

        emit LogV1YieldMinted(msg.sender, _stakeId, tokenAmount);
    }

    function mintV1YieldMultiple(uint256[] calldata _stakeIds) external {
        uint256 amountToMint;

        // we're using selector to simplify input and state validation
        bytes4 fnSelector = ILVPool(this).mintV1YieldMultiple.selector;

        for (uint256 i = 0; i < _stakeIds.length; i++) {
            uint256 _stakeId = _stakeIds[i];
            (uint256 tokenAmount, , , uint64 lockedUntil, bool isYield) = ICorePoolV1(corePoolV1).getDeposit(
                msg.sender,
                _stakeId
            );
            fnSelector.verifyState(isYield, i * 3);
            fnSelector.verifyState(_now256() > lockedUntil, i * 3 + 1);
            fnSelector.verifyState(!v1YieldMinted[msg.sender][_stakeId], i * 3 + 2);

            v1YieldMinted[msg.sender][_stakeId] = true;
            amountToMint += tokenAmount;
        }

        factory.mintYieldTo(msg.sender, amountToMint, false);

        emit LogV1YieldMintedMultiple(msg.sender, _stakeIds, amountToMint);
    }
}
