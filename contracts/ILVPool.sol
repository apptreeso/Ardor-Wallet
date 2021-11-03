// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { IERC20, SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
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
    using SafeERC20 for IERC20;

    /// @dev maps `keccak256(userAddress,stakeId)` to a bool value that tells
    ///      if a v1 yield has already been minted by v2 contract.
    mapping(address => mapping(uint256 => bool)) public v1YieldMinted;

    /**
     * @dev Fired in `claimYieldRewardsMultiple()`.
     *
     * @param from staker address
     * @param pools address array of pools to be claimed
     * @param useSILV whether claims should use SILV or ILV
     */
    event LogClaimYieldRewardsMultiple(address indexed from, address[] pools, bool[] useSILV);

    /**
     * @dev Fired in `claimVaultRewardsMultiple()`.
     *
     * @param from staker address
     * @param pools address array of pools to be claimed
     */
    event LogClaimVaultRewardsMultiple(address indexed from, address[] pools);

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
        uint256 _v1StakeMaxPeriod,
        bytes32 _merkleRoot
    ) external initializer {
        __V2Migrator_init(
            _ilv,
            _silv,
            _poolToken,
            _corePoolV1,
            _factory,
            _initTime,
            _weight,
            _v1StakeMaxPeriod,
            _merkleRoot
        );
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
    function stakeAsPool(address _staker, uint256 _value) external updatePool nonReentrant {
        _requireNotPaused();
        ILVPool(this).stakeAsPool.selector.verifyAccess(factory.poolExists(msg.sender));
        User storage user = users[_staker];
        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);
        if (user.totalWeight > 0) {
            _processRewards(_staker, v1WeightToAdd, subYieldRewards, subVaultRewards);
        }
        uint256 stakeWeight = _value * Stake.YIELD_STAKE_WEIGHT_MULTIPLIER;
        Stake.Data memory newStake = Stake.Data({
            value: uint112(_value),
            lockedFrom: uint64(_now256()),
            lockedUntil: uint64(_now256() + 365 days),
            isYield: true,
            fromV1: false
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

        emit LogStakeAndLock(msg.sender, _staker, _value, uint64(_now256() + 365 days));
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
    function claimYieldRewardsMultiple(address[] calldata _pools, bool[] calldata _useSILV) external updatePool {
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

        emit LogClaimYieldRewardsMultiple(msg.sender, _pools, _useSILV);
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
    function claimVaultRewardsMultiple(address[] calldata _pools) external updatePool {
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

        emit LogClaimVaultRewardsMultiple(msg.sender, _pools);
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

        emit LogV1YieldMintedMultiple(msg.sender, amountToMint);
    }
}
