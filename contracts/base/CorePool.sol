// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { Timestamp } from "./Timestamp.sol";
import { FactoryControlled } from "./FactoryControlled.sol";
import { VaultRecipient } from "./VaultRecipient.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IlluviumAware } from "../libraries/IlluviumAware.sol";
import { Stake } from "../libraries/Stake.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPoolBase } from "../interfaces/IPoolBase.sol";
import { ICorePool } from "../interfaces/ICorePool.sol";
import { ICorePoolV1 } from "../interfaces/ICorePoolV1.sol";

import "hardhat/console.sol";

abstract contract CorePool is
    IPoolBase,
    UUPSUpgradeable,
    FactoryControlled,
    VaultRecipient,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    Timestamp
{
    using SafeERC20 for IERC20;
    using Stake for Stake.Data;

    /// @dev Token holder storage, maps token holder address to their data record
    mapping(address => User) public override users;

    /// @dev Link to sILV ERC20 Token instance
    address public override silv;

    /// @dev Link to ILV ERC20 Token instance
    address public override ilv;

    /// @dev Link to the pool token instance, for example ILV or ILV/ETH pair
    address public override poolToken;

    /// @dev address of v1 core pool with same poolToken
    address public corePoolV1;

    /// @dev Pool weight, 200 for ILV pool or 800 for ILV/ETH
    uint32 public override weight;

    /// @dev Timestamp of the last yield distribution event
    uint64 public override lastYieldDistribution;

    /// @dev Used to calculate yield rewards
    /// @dev This value is different from "reward per token" used in locked pool
    /// @dev Note: stakes are different in duration and "weight" reflects that
    uint256 public override yieldRewardsPerWeight;

    /// @dev Used to calculate yield rewards, keeps track of the tokens weight locked in staking
    uint256 public override globalWeight;

    /**
     * @dev When we know beforehand that staking is done for a year, and fraction of the year locked is one,
     *      we use simplified calculation and use the following constant instead previos one
     */
    uint256 internal constant YEAR_STAKE_WEIGHT_MULTIPLIER = 2 * 1e6;

    /**
     * @dev Rewards per weight are stored multiplied by 1e12, as integers.
     */
    uint256 internal constant REWARD_PER_WEIGHT_MULTIPLIER = 1e12;

    /**
     * @dev Multiplier used as a bonus for v1 stakes
     */
    uint256 internal constant V1_WEIGHT_BONUS = 2;

    /**
     * @dev Fired in stakeFlexible()
     * @param from token holder address, the tokens will be returned to that address
     * @param value value of tokens staked
     */
    event LogStakeFlexible(address indexed from, uint256 value);

    /**
     * @dev Fired in _stakeAndLock()
     * @param from token holder address, the tokens will be returned to that address
     * @param value value of tokens staked
     * @param lockUntil timestamp indicating when tokens should unlock (max 2 years)
     */
    event LogStakeAndLock(address indexed from, uint256 value, uint64 lockUntil);

    /**
     * @dev Fired in _updateStakeLock() and updateStakeLock()
     *
     * @param from stake holder
     * @param stakeId stake id to be updated
     * @param lockedFrom stake locked from timestamp value
     * @param lockedUntil updated stake locked until timestamp value
     */
    event LogUpdateStakeLock(address indexed from, uint256 stakeId, uint64 lockedFrom, uint64 lockedUntil);

    /**
     * @dev Fired in unstakeFlexible()
     *
     * @param to address receiving the tokens (user)
     * @param value number of tokens unstaked
     */
    event LogUnstakeFlexible(address indexed to, uint256 value);

    /**
     * @dev Fired in unstakeLocked()
     *
     * @param to address receiving the tokens (user)
     * @param stakeId id value of the stake
     * @param value number of tokens unstaked
     */
    event LogUnstakeLocked(address indexed to, uint256 stakeId, uint256 value);

    /**
     * @dev Fired in _sync(), sync() and dependent functions (stake, unstake, etc.)
     *
     * @param by an address which performed an operation
     * @param yieldRewardsPerWeight updated yield rewards per weight value
     * @param lastYieldDistribution usually, current timestamp
     */
    event LogSync(address indexed by, uint256 yieldRewardsPerWeight, uint64 lastYieldDistribution);

    /**
     * @dev Fired in _claimRewards()
     *
     * @param from an address which received the yield
     * @param sILV flag indicating if reward was paid (minted) in sILV
     * @param value value of yield paid
     */
    event LogClaimRewards(address indexed from, bool sILV, uint256 value);

    /**
     * @dev Fired in _processRewards()
     *
     * @param from an address which received the yield
     * @param value value of yield paid
     */
    event LogProcessRewards(address indexed from, uint256 value);

    /**
     * @dev Fired in setWeight()
     *
     * @param by an address which performed an operation, always a factory
     * @param fromVal old pool weight value
     * @param toVal new pool weight value
     */
    event LogSetWeight(address indexed by, uint32 fromVal, uint32 toVal);

    /**
     * @dev fired in migrateUser()
     *
     * @param from user asking migration
     * @param to new user address
     */
    event LogMigrateUser(address indexed from, address indexed to);

    /// @dev used for functions that require syncing contract state before execution
    modifier updatePool() {
        _sync();
        _;
    }

    /**
     * @dev Overridden in sub-contracts to initialize the pool
     *
     * @param _ilv ILV ERC20 Token address
     * @param _silv sILV ERC20 Token address
     * @param _poolToken token the pool operates on, for example ILV or ILV/ETH pair
     * @param _initTime initial timestamp used to calculate the rewards
     *      note: _initTime can be set to the future effectively meaning _sync() calls will do nothing
     * @param _weight number representing a weight of the pool, actual weight fraction
     *      is calculated as that number divided by the total pools weight and doesn't exceed one
     */
    function __CorePool_init(
        address _ilv,
        address _silv,
        address _poolToken,
        uint64 _initTime,
        uint32 _weight
    ) internal initializer {
        require(_poolToken != address(0), "pool token address not set");
        require(_initTime > 0, "init time not set");
        require(_weight > 0, "pool weight not set");

        // verify ilv and silv instanes
        IlluviumAware.verifyILV(_ilv);
        IlluviumAware.verifySILV(_silv);

        // save the inputs into internal state variables
        ilv = _ilv;
        silv = _silv;
        poolToken = _poolToken;
        weight = _weight;

        // init the dependent internal state variables
        lastYieldDistribution = _initTime;
    }

    /**
     * @notice Calculates current yield rewards value available for address specified
     *
     * @dev see _pendingYieldRewards() for further details
     *
     * @param _staker an address to calculate yield rewards value for
     * @return calculated yield reward value for the given address
     */
    function pendingYieldRewards(address _staker) external view override returns (uint256 pending) {
        // `newYieldRewardsPerWeight` will store stored or recalculated value for `yieldRewardsPerWeight`
        uint256 newYieldRewardsPerWeight;

        // if smart contract state was not updated recently, `yieldRewardsPerWeight` value
        // is outdated and we need to recalculate it in order to calculate pending rewards correctly
        if (_now256() > lastYieldDistribution && globalWeight != 0) {
            uint256 endTime = factory.endTime();
            uint256 multiplier = _now256() > endTime
                ? endTime - lastYieldDistribution
                : _now256() - lastYieldDistribution;
            uint256 ilvRewards = (multiplier * weight * factory.ilvPerSecond()) / factory.totalWeight();

            // recalculated value for `yieldRewardsPerWeight`
            newYieldRewardsPerWeight = _rewardPerWeight(ilvRewards, globalWeight) + yieldRewardsPerWeight;
        } else {
            // if smart contract state is up to date, we don't recalculate
            newYieldRewardsPerWeight = yieldRewardsPerWeight;
        }

        // based on the rewards per weight value, calculate pending rewards;
        User storage user = users[_staker];

        // gas savings
        uint256 v1StakesLength = user.v1StakesIds.length;
        // value will be used to add to final weight calculations before
        // calculating rewards
        uint256 weightToAdd;

        // checks if user has any migrated stake from v1
        if (v1StakesLength > 0) {
            // loops through v1StakesIds and adds v1 weight with V1_WEIGHT_BONUS
            for (uint256 i = 0; i < v1StakesLength; i++) {
                (, uint256 _weight) = ICorePoolV1(corePoolV1).getDeposit(_staker, user.v1StakesIds[i]);

                weightToAdd += weight * V1_WEIGHT_BONUS;
            }
        }

        pending = _weightToReward(user.totalWeight, newYieldRewardsPerWeight) - user.subYieldRewards;
    }

    /**
     * @notice Returns total staked token balance for the given address
     *
     * @param _user an address to query balance for
     * @return total staked token balance
     */
    // function balanceOf(address _user) external view override returns (uint256) {
    //     // read specified user token value and return
    //     return users[_user].tokenAmount;
    // }

    /**
     * @notice Returns information on the given stake for the given address
     *
     * @dev See getStakesLength
     *
     * @param _user an address to query stake for
     * @param _stakeId zero-indexed stake ID for the address specified
     * @return stake info as Stake structure
     */
    function getStake(address _user, uint256 _stakeId) external view virtual returns (Stake.Data memory) {
        // read stake at specified index and return
        return users[_user].stakes[_stakeId];
    }

    /**
     * @notice Returns number of stakes for the given address. Allows iteration over stakes.
     *
     * @dev See getStake
     *
     * @param _user an address to query stake length for
     * @return number of stakes for the given address
     */
    function getStakesLength(address _user) external view override returns (uint256) {
        // read stakes array length and return
        return users[_user].stakes.length;
    }

    /**
     * @notice Stakes specified value of tokens for the specified value of time,
     *      and pays pending yield rewards if any
     *
     * @dev Requires value to stake to be greater than zero
     *
     * @param _value value of tokens to stake
     * @param _lockUntil stake period as unix timestamp; zero means no locking
     */
    function stakeAndLock(uint256 _value, uint64 _lockUntil) external override nonReentrant {
        // delegate call to an internal function
        _stakeAndLock(msg.sender, _value, _lockUntil, false);
    }

    /**
     * @dev stakes poolTokens without lock
     *
     * @notice we use standard weight for flexible stakes (since it's never locked)
     *
     * @param _value number of tokens to stake
     */
    function stakeFlexible(uint256 _value) external updatePool nonReentrant {
        // validates input
        require(_value > 0, "zero value");

        // get a link to user data struct, we will write to it later
        User storage user = users[msg.sender];
        // process current pending rewards if any
        if (user.totalWeight > 0) {
            _processRewards(msg.sender);
        }

        // in most of the cases added value `addedValue` is simply `_value`
        // however for deflationary tokens this can be different

        // gas savings
        address _poolToken = poolToken;
        // read the current balance
        uint256 previousBalance = IERC20(_poolToken).balanceOf(address(this));
        // transfer `_value`; note: some tokens may get burnt here
        IERC20(_poolToken).safeTransferFrom(address(msg.sender), address(this), _value);
        // read new balance, usually this is just the difference `previousBalance - _value`
        uint256 newBalance = IERC20(_poolToken).balanceOf(address(this));
        // calculate real value taking into account deflation
        uint256 addedValue = newBalance - previousBalance;

        // no need to calculate locking weight, flexible stake never locks
        uint256 stakeWeight = Stake.WEIGHT_MULTIPLIER * addedValue;

        // makes sure stakeWeight is valid
        assert(stakeWeight > 0);

        // create and save the stake (append it to stakes array)
        Stake.Data memory stake = Stake.Data({
            value: uint120(addedValue),
            lockedFrom: 0,
            lockedUntil: 0,
            isYield: false
        });
        // stake ID is an index of the stake in `stakes` array
        user.stakes.push(stake);

        // update user record
        user.flexibleBalance += uint128(addedValue);
        user.totalWeight += stakeWeight;
        user.subYieldRewards = _weightToReward(user.totalWeight, yieldRewardsPerWeight);

        // update global variable
        globalWeight += stakeWeight;

        // emit an event
        emit LogStakeFlexible(msg.sender, _value);
    }

    /**
     * @dev migrates msg.sender data to a new address
     *
     * @notice data is copied to memory so we can delete previous address data
     * before we store it in new address
     *
     * @param _to new user address
     */
    function migrateUser(address _to) external updatePool {
        User storage newUser = users[_to];
        require(newUser.stakes.length == 0 && newUser.v1StakesIds.length == 0, "invalid user, already exists");

        User storage previousUser = users[msg.sender];
        delete users[msg.sender];
        newUser = previousUser;

        emit LogMigrateUser(msg.sender, _to);
    }

    /**
     * @notice Extends locking period for a given stake
     *
     * @dev Requires new lockedUntil value to be:
     *      higher than the current one, and
     *      in the future, but
     *      no more than 2 years in the future
     *
     * @param _stakeId updated stake ID
     * @param _lockedUntil updated stake locked until value
     */
    function updateStakeLock(uint256 _stakeId, uint64 _lockedUntil) external updatePool {
        _processRewards(msg.sender);

        // validate the input time
        require(_lockedUntil > _now256(), "lock should be in the future");

        // get a link to user data struct, we will write to it later
        User storage user = users[msg.sender];
        // get a link to the corresponding stake, we may write to it later
        Stake.Data storage stake = user.stakes[_stakeId];

        // validate the input against stake structure
        require(_lockedUntil > stake.lockedUntil, "invalid new lock");

        // saves previous weight into memory
        uint256 previousWeight = stake.weight();
        // gas savings
        uint64 stakeLockedFrom = stake.lockedFrom;

        // verify locked from and locked until values
        if (stakeLockedFrom == 0) {
            require(_lockedUntil - _now256() <= 365 days, "max lock period is 365 days");
            stakeLockedFrom = uint64(_now256());
            stake.lockedFrom = stakeLockedFrom;
        } else {
            require(_lockedUntil - stakeLockedFrom <= 365 days, "max lock period is 365 days");
        }

        // update locked until value, calculate new weight
        stake.lockedUntil = _lockedUntil;
        // saves new weight into memory
        uint256 newWeight = stake.weight();
        // update user total weight and global locking weight
        user.totalWeight = user.totalWeight - previousWeight + newWeight;
        globalWeight = globalWeight - previousWeight + newWeight;

        // emit an event
        emit LogUpdateStakeLock(msg.sender, _stakeId, stakeLockedFrom, _lockedUntil);
    }

    /**
     * @notice Service function to synchronize pool state with current time
     *
     * @dev Can be executed by anyone at any time, but has an effect only when
     *      at least one second passes between synchronizations
     * @dev Executed internally when staking, unstaking, processing rewards in order
     *      for calculations to be correct and to reflect state progress of the contract
     * @dev When timing conditions are not met (executed too frequently, or after factory
     *      end time), function doesn't throw and exits silently
     */
    function sync() external override {
        // delegate call to an internal function
        _sync();
    }

    function claimRewards(bool _useSILV) external override updatePool {
        _claimRewards(msg.sender, _useSILV);
    }

    /**
     * @dev Executed by the factory to modify pool weight; the factory is expected
     *      to keep track of the total pools weight when updating
     *
     * @dev Set weight to zero to disable the pool
     *
     * @param _weight new weight to set for the pool
     */
    function setWeight(uint32 _weight) external override {
        // verify function is executed by the factory
        require(msg.sender == address(factory), "access denied");

        // set the new weight value
        weight = _weight;

        // emit an event logging old and new weight values
        emit LogSetWeight(msg.sender, weight, _weight);
    }

    /**
     * @dev Similar to public pendingYieldRewards, but performs calculations based on
     *      current smart contract state only, not taking into account any additional
     *      time which might have passed.
     * @dev It performs a check on v1StakesIds and calls the corresponding V1 core pool
     *      in order to add v1 weight into v2 yield calculations.
     *
     * @notice v1 weight is multiplied by V1_WEIGHT_BONUS as a reward to staking early
     *         adopters.
     *
     * @param _staker an address to calculate yield rewards value for
     * @return pending calculated yield reward value for the given address
     */
    function _pendingYieldRewards(address _staker) internal view returns (uint256 pending) {
        // links to _staker user struct in storage
        User storage user = users[_staker];

        // gas savings
        uint256 v1StakesLength = user.v1StakesIds.length;
        // value will be used to add to final weight calculations before
        // calculating rewards
        uint256 weightToAdd;

        // checks if user has any migrated stake from v1
        if (v1StakesLength > 0) {
            // loops through v1StakesIds and adds v1 weight with V1_WEIGHT_BONUS
            for (uint256 i = 0; i < v1StakesLength; i++) {
                (, uint256 _weight) = ICorePoolV1(corePoolV1).getDeposit(_staker, user.v1StakesIds[i]);

                weightToAdd += weight * V1_WEIGHT_BONUS;
            }
        }

        pending = _weightToReward((user.totalWeight + weightToAdd), yieldRewardsPerWeight);
    }

    /**
     * @dev Used internally, mostly by children implementations, see stake()
     *
     * @param _staker an address which stakes tokens and which will receive them back
     * @param _value value of tokens to stake
     * @param _lockUntil stake period as unix timestamp; zero means no locking
     * @param _isYield a flag indicating if that stake is created to store yield reward
     *      from the previously unstaked stake
     */
    function _stakeAndLock(
        address _staker,
        uint256 _value,
        uint64 _lockUntil,
        bool _isYield
    ) internal virtual updatePool {
        // validate the inputs
        require(_value > 0, "zero value");
        require(
            _lockUntil == 0 || (_lockUntil > _now256() && _lockUntil - _now256() <= 365 days),
            "invalid lock interval"
        );

        // get a link to user data struct, we will write to it later
        User storage user = users[_staker];
        // process current pending rewards if any
        if (user.totalWeight > 0) {
            _processRewards(_staker);
        }

        // in most of the cases added value `addedValue` is simply `_value`
        // however for deflationary tokens this can be different

        // gas savings
        address _poolToken = poolToken;
        // read the current balance
        uint256 previousBalance = IERC20(_poolToken).balanceOf(address(this));
        // transfer `_value`; note: some tokens may get burnt here
        IERC20(_poolToken).safeTransferFrom(address(msg.sender), address(this), _value);
        // read new balance, usually this is just the difference `previousBalance - _value`
        uint256 newBalance = IERC20(_poolToken).balanceOf(address(this));
        // calculate real value taking into account deflation
        uint256 addedValue = newBalance - previousBalance;

        // set the `lockFrom` and `lockUntil` taking into account that
        // zero value for `_lockUntil` means "no locking" and leads to zero values
        // for both `lockFrom` and `lockUntil`
        uint64 lockFrom = _lockUntil > 0 ? uint64(_now256()) : 0;
        uint64 lockUntil = _lockUntil;

        // stake weight formula rewards for locking
        uint256 stakeWeight = (((lockUntil - lockFrom) * Stake.WEIGHT_MULTIPLIER) /
            365 days +
            Stake.WEIGHT_MULTIPLIER) * addedValue;

        // makes sure stakeWeight is valid
        assert(stakeWeight > 0);

        // create and save the stake (append it to stakes array)
        Stake.Data memory stake = Stake.Data({
            value: uint120(addedValue),
            lockedFrom: lockFrom,
            lockedUntil: lockUntil,
            isYield: _isYield
        });
        // stake ID is an index of the stake in `stakes` array
        user.stakes.push(stake);

        // update user record
        user.totalWeight += stakeWeight;
        user.subYieldRewards = _weightToReward(user.totalWeight, yieldRewardsPerWeight);

        // update global variable
        globalWeight += stakeWeight;

        // emit an event
        emit LogStakeAndLock(msg.sender, _value, _lockUntil);
    }

    function unstakeFlexible(uint256 _value) external override updatePool {
        // verify a value is set
        require(_value > 0, "zero value");
        // get a link to user data struct, we will write to it later
        User storage user = users[msg.sender];
        // verify available balance
        require(user.flexibleBalance >= _value, "value exceeds user balance");
        // and process current pending rewards if any
        _processRewards(msg.sender);

        // updates user data in storage
        user.flexibleBalance -= uint128(_value);
        user.totalWeight -= _value * Stake.WEIGHT_MULTIPLIER;

        // finally, transfers `_value` poolTokens
        IERC20(poolToken).safeTransfer(msg.sender, _value);

        // emit an event
        emit LogUnstakeFlexible(msg.sender, _value);
    }

    /**
     * @dev Used internally, mostly by children implementations, see unstake()
     *
     * @param _stakeId stake ID to unstake from, zero-indexed
     * @param _value value of tokens to unstake
     */
    function unstakeLocked(uint256 _stakeId, uint256 _value) external override updatePool {
        // verify a value is set
        require(_value > 0, "zero value");
        // get a link to user data struct, we will write to it later
        User storage user = users[msg.sender];
        // get a link to the corresponding stake, we may write to it later
        Stake.Data storage stake = user.stakes[_stakeId];
        // checks if stake is unlocked already
        require(_now256() > stake.lockedUntil, "deposit not yet unlocked");
        // stake structure may get deleted, so we save isYield flag to be able to use it
        // we also save stakeValue for gasSavings
        (uint120 stakeValue, bool isYield) = (stake.value, stake.isYield);
        // verify available balance
        require(stakeValue >= _value, "value exceeds stake");
        // and process current pending rewards if any
        _processRewards(msg.sender);

        // store stake weight
        uint256 previousWeight = stake.weight();
        // value used to save new weight after updates in storage
        uint256 newWeight;

        // update the stake, or delete it if its depleted
        if (stakeValue - _value == 0) {
            // deles stake struct, no need to save new weight because it stays 0
            delete user.stakes[_stakeId];
        } else {
            stake.value -= uint120(_value);
            // saves new weight to memory
            newWeight = stake.weight();
        }

        // update user record
        user.totalWeight = user.totalWeight - previousWeight + newWeight;
        user.subYieldRewards = _weightToReward(user.totalWeight, yieldRewardsPerWeight);

        // update global variable
        globalWeight = globalWeight - previousWeight + newWeight;

        // if the stake was created by the pool itself as a yield reward
        if (isYield) {
            // mint the yield via the factory
            factory.mintYieldTo(msg.sender, _value, false);
        } else {
            // otherwise just return tokens back to holder
            IERC20(poolToken).safeTransfer(msg.sender, _value);
        }

        // emit an event
        emit LogUnstakeLocked(msg.sender, _stakeId, _value);
    }

    /**
     * @dev Used internally, mostly by children implementations, see sync()
     *
     * @dev Updates smart contract state (`yieldRewardsPerWeight`, `lastYieldDistribution`),
     *      updates factory state via `updateILVPerSecond`
     */
    function _sync() internal virtual {
        // update ILV per second value in factory if required
        if (factory.shouldUpdateRatio()) {
            factory.updateILVPerSecond();
        }

        // check bound conditions and if these are not met -
        // exit silently, without emitting an event
        uint256 endTime = factory.endTime();
        if (lastYieldDistribution >= endTime) {
            return;
        }
        if (_now256() <= lastYieldDistribution) {
            return;
        }
        // if locking weight is zero - update only `lastYieldDistribution` and exit
        if (globalWeight == 0) {
            lastYieldDistribution = uint64(_now256());
            return;
        }

        // to calculate the reward we need to know how many seconds passed, and reward per second
        uint256 currentTimestamp = _now256() > endTime ? endTime : _now256();
        uint256 secondsPassed = currentTimestamp - lastYieldDistribution;
        uint256 ilvPerSecond = factory.ilvPerSecond();

        // calculate the reward
        uint256 ilvReward = (secondsPassed * ilvPerSecond * weight) / factory.totalWeight();

        // update rewards per weight and `lastYieldDistribution`
        yieldRewardsPerWeight += _rewardPerWeight(ilvReward, globalWeight);
        lastYieldDistribution = uint64(currentTimestamp);

        // emit an event
        emit LogSync(msg.sender, yieldRewardsPerWeight, lastYieldDistribution);
    }

    /**
     * @dev Used internally, mostly by children implementations.
     * @dev Executed before staking, unstaking and claiming the rewards.
     * @dev When timing conditions are not met (executed too frequently, or after factory
     *      end block), function doesn't throw and exits silently
     *
     * @param _staker an address which receives the reward (which has staked some tokens earlier)
     * @return pendingYield the rewards calculated and saved to the user struct
     */
    function _processRewards(address _staker) internal virtual returns (uint256 pendingYield) {
        // calculate pending yield rewards, this value will be returned
        pendingYield = _pendingYieldRewards(_staker);

        // if pending yield is zero - just return silently
        if (pendingYield == 0) return 0;

        // get link to a user data structure, we will write into it later
        User storage user = users[_staker];

        user.pendingYield += uint128(pendingYield);

        // emit an event
        emit LogProcessRewards(_staker, pendingYield);
    }

    function _claimRewards(address _staker, bool _useSILV) internal {
        // update user state
        _processRewards(_staker);

        // get link to a user data structure, we will write into it later
        User storage user = users[_staker];

        // check pending yield rewards to claim and save to memory
        uint256 pendingYieldToClaim = uint256(user.pendingYield);

        // if pending yield is zero - just return silently
        if (pendingYieldToClaim == 0) return;

        // clears user pending yield
        user.pendingYield = 0;

        // if sILV is requested
        if (_useSILV) {
            // - mint sILV
            IERC20(silv).mint(_staker, pendingYieldToClaim);
        } else if (poolToken == ilv) {
            // calculate pending yield weight,
            // 2e6 is the bonus weight when staking for 1 year
            uint256 stakeWeight = pendingYieldToClaim * YEAR_STAKE_WEIGHT_MULTIPLIER;

            // if the pool is ILV Pool - create new ILV stake
            // and save it - push it into stakes array
            Stake.Data memory newStake = Stake.Data({
                value: pendingYieldToClaim,
                lockedFrom: uint64(_now256()),
                lockedUntil: uint64(_now256() + 365 days), // staking yield for 1 year
                isYield: true
            });

            user.stakes.push(newStake);
            user.totalWeight += stakeWeight;

            // update global variable
            globalWeight += stakeWeight;
        } else {
            // for other pools - stake as pool
            address ilvPool = factory.getPoolAddress(ilv);
            ICorePool(ilvPool).stakeAsPool(_staker, pendingYieldToClaim);
        }

        // subYieldRewards needs to be updated on every `_processRewards` call
        user.subYieldRewards = _weightToReward(user.totalWeight, yieldRewardsPerWeight);

        // emit an event
        emit LogClaimRewards(_staker, _useSILV, pendingYieldToClaim);
    }

    /**
     * @dev Converts stake weight (not to be mixed with the pool weight) to
     *      ILV reward value, applying the 10^12 division on weight
     *
     * @param _weight stake weight
     * @param _rewardPerWeight ILV reward per weight
     * @return reward value normalized to 10^12
     */
    function _weightToReward(uint256 _weight, uint256 _rewardPerWeight) private pure returns (uint256) {
        // apply the formula and return
        return (_weight * _rewardPerWeight) / REWARD_PER_WEIGHT_MULTIPLIER;
    }

    /**
     * @dev Converts reward ILV value to stake weight (not to be mixed with the pool weight),
     *      applying the 10^12 multiplication on the reward
     *      - OR -
     * @dev Converts reward ILV value to reward/weight if stake weight is supplied as second
     *      function parameter instead of reward/weight
     *
     * @param _reward yield reward
     * @param _globalWeight total weight in the pool
     * @return reward per weight value
     */
    function _rewardPerWeight(uint256 _reward, uint256 _globalWeight) private pure returns (uint256) {
        // apply the reverse formula and return
        return (_reward * REWARD_PER_WEIGHT_MULTIPLIER) / _globalWeight;
    }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address) internal override onlyFactoryController {}
}
