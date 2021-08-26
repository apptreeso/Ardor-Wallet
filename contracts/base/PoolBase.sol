// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { Timestamp } from "./Timestamp.sol";
import { FactoryControlled } from "./FactoryControlled.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IlluviumAware } from "../libraries/IlluviumAware.sol";
import { Stake } from "../libraries/Stake.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IPoolBase } from "../interfaces/IPoolBase.sol";
import { ICorePool } from "../interfaces/ICorePool.sol";

import "hardhat/console.sol";

// TODO: redefine user struct supporting 721
abstract contract PoolBase is
    IPoolBase,
    UUPSUpgradeable,
    FactoryControlled,
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

    /// @dev Pool weight, 100 for ILV pool or 900 for ILV/ETH
    uint32 public override weight;

    /// @dev Timestamp of the last yield distribution event
    uint64 public override lastYieldDistribution;

    /// @dev Used to calculate yield rewards
    /// @dev This value is different from "reward per token" used in locked pool
    /// @dev Note: stakes are different in duration and "weight" reflects that
    uint256 public override yieldRewardsPerWeight;

    /// @dev Used to calculate yield rewards, keeps track of the tokens weight locked in staking
    uint256 public override usersLockingWeight;

    /**
     * @dev Stake weight is proportional to deposit amount and time locked, precisely
     *      "deposit amount wei multiplied by (fraction of the year locked plus one)"
     * @dev To avoid significant precision loss due to multiplication by "fraction of the year" [0, 1],
     *      weight is stored multiplied by 1e6 constant, as an integer
     * @dev Corner case 1: if time locked is zero, weight is deposit amount multiplied by 1e6
     * @dev Corner case 2: if time locked is one year, fraction of the year locked is one, and
     *      weight is a deposit amount multiplied by 2 * 1e6
     */
    uint256 internal constant WEIGHT_MULTIPLIER = 1e6;

    /**
     * @dev When we know beforehand that staking is done for a year, and fraction of the year locked is one,
     *      we use simplified calculation and use the following constant instead previos one
     */
    uint256 internal constant YEAR_STAKE_WEIGHT_MULTIPLIER = 2 * WEIGHT_MULTIPLIER;

    /**
     * @dev Rewards per weight are stored multiplied by 1e12, as integers.
     */
    uint256 internal constant REWARD_PER_WEIGHT_MULTIPLIER = 1e12;

    /**
     * @dev Fired in _stake() and stake()
     *
     * @param _by an address which performed an operation, usually token holder
     * @param _from token holder address, the tokens will be returned to that address
     * @param amount amount of tokens staked
     */
    event Staked(address indexed _by, address indexed _from, uint256 amount);

    /**
     * @dev Fired in _updateStakeLock() and updateStakeLock()
     *
     * @param _by an address which performed an operation
     * @param depositId updated deposit ID
     * @param lockedFrom deposit locked from value
     * @param lockedUntil updated deposit locked until value
     */
    event StakeLockUpdated(address indexed _by, uint256 depositId, uint64 lockedFrom, uint64 lockedUntil);

    /**
     * @dev Fired in _unstake() and unstake()
     *
     * @param _by an address which performed an operation, usually token holder
     * @param _to an address which received the unstaked tokens, usually token holder
     * @param amount amount of tokens unstaked
     */
    event Unstaked(address indexed _by, address indexed _to, uint256 amount);

    /**
     * @dev Fired in _sync(), sync() and dependent functions (stake, unstake, etc.)
     *
     * @param _by an address which performed an operation
     * @param yieldRewardsPerWeight updated yield rewards per weight value
     * @param lastYieldDistribution usually, current timestamp
     */
    event Synchronized(address indexed _by, uint256 yieldRewardsPerWeight, uint64 lastYieldDistribution);

    /**
     * @dev Fired in _processRewards(), processRewards() and dependent functions (stake, unstake, etc.)
     *
     * @param _by an address which performed an operation
     * @param _to an address which claimed the yield reward
     * @param sIlv flag indicating if reward was paid (minted) in sILV
     * @param amount amount of yield paid
     */
    event YieldClaimed(address indexed _by, address indexed _to, bool sIlv, uint256 amount);

    /**
     * @dev Fired in setWeight()
     *
     * @param _by an address which performed an operation, always a factory
     * @param _fromVal old pool weight value
     * @param _toVal new pool weight value
     */
    event PoolWeightUpdated(address indexed _by, uint32 _fromVal, uint32 _toVal);

    /**
     * @dev fired in migrateUser()
     *
     * @param _from user asking migration
     * @param _to new user address
     */
    event LogMigrateUser(address indexed _from, address indexed _to);

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
     * @param _factory Pool factory IlluviumPoolFactory instance/address
     * @param _poolToken token the pool operates on, for example ILV or ILV/ETH pair
     * @param _initTime initial timestamp used to calculate the rewards
     *      note: _initTime can be set to the future effectively meaning _sync() calls will do nothing
     * @param _weight number representing a weight of the pool, actual weight fraction
     *      is calculated as that number divided by the total pools weight and doesn't exceed one
     */
    function __PoolBase_init(
        address _ilv,
        address _silv,
        address _poolToken,
        uint64 _initTime,
        uint32 _weight
    ) internal initializer {
        require(address(_factory) != address(0), "ILV Pool fct address not set");
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
     * @param _staker an address to calculate yield rewards value for
     * @return calculated yield reward value for the given address
     */
    function pendingYieldRewards(address _staker) external view override returns (uint256) {
        // `newYieldRewardsPerWeight` will store stored or recalculated value for `yieldRewardsPerWeight`
        uint256 newYieldRewardsPerWeight;

        // if smart contract state was not updated recently, `yieldRewardsPerWeight` value
        // is outdated and we need to recalculate it in order to calculate pending rewards correctly
        if (_now256() > lastYieldDistribution && usersLockingWeight != 0) {
            uint256 endTime = factory.endTime();
            uint256 multiplier = _now256() > endTime
                ? endTime - lastYieldDistribution
                : _now256() - lastYieldDistribution;
            uint256 ilvRewards = (multiplier * weight * factory.ilvPerSecond()) / factory.totalWeight();

            // recalculated value for `yieldRewardsPerWeight`
            newYieldRewardsPerWeight = _rewardPerWeight(ilvRewards, usersLockingWeight) + yieldRewardsPerWeight;
        } else {
            // if smart contract state is up to date, we don't recalculate
            newYieldRewardsPerWeight = yieldRewardsPerWeight;
        }

        // based on the rewards per weight value, calculate pending rewards;
        User memory user = users[_staker];
        uint256 pending = _weightToReward(user.totalWeight, newYieldRewardsPerWeight) - user.subYieldRewards;

        return pending;
    }

    /**
     * @notice Returns total staked token balance for the given address
     *
     * @param _user an address to query balance for
     * @return total staked token balance
     */
    // function balanceOf(address _user) external view override returns (uint256) {
    //     // read specified user token amount and return
    //     return users[_user].tokenAmount;
    // }

    /**
     * @notice Returns information on the given deposit for the given address
     *
     * @dev See getDepositsLength
     *
     * @param _user an address to query deposit for
     * @param _depositId zero-indexed deposit ID for the address specified
     * @return deposit info as Deposit structure
     */
    function getDeposit(address _user, uint256 _depositId) external view override returns (Stake memory) {
        // read deposit at specified index and return
        return users[_user].stakes[_depositId];
    }

    /**
     * @notice Returns number of deposits for the given address. Allows iteration over deposits.
     *
     * @dev See getDeposit
     *
     * @param _user an address to query deposit length for
     * @return number of deposits for the given address
     */
    function getDepositsLength(address _user) external view override returns (uint256) {
        // read deposits array length and return
        return users[_user].stakes.length;
    }

    /**
     * @notice Stakes specified amount of tokens for the specified amount of time,
     *      and pays pending yield rewards if any
     *
     * @dev Requires amount to stake to be greater than zero
     *
     * @param _amount amount of tokens to stake
     * @param _lockUntil stake period as unix timestamp; zero means no locking
     * @param _useSILV a flag indicating if previous reward to be paid as sILV
     */
    function stakeAndLock(uint256 _amount, uint64 _lockUntil) external override {
        // delegate call to an internal function
        _stakeAndLock(msg.sender, _amount, _lockUntil, false);
    }

    /**
     * @dev stakes poolTokens without lock
     *
     * @notice we use standard weight for flexible stakes (since it's never locked)
     *
     * @param _value number of tokens to stake
     */
    function stakeFlexible(uint256 _value) external updatePool {
        // validates input
        require(_value > 0, "zero amount");

        // get a link to user data struct, we will write to it later
        User storage user = users[_staker];
        // process current pending rewards if any
        if (user.totalWeight > 0) {
            _processRewards(_staker, false);
        }

        // in most of the cases added amount `addedAmount` is simply `_amount`
        // however for deflationary tokens this can be different

        // read the current balance
        uint256 previousBalance = IERC20(poolToken).balanceOf(address(this));
        // transfer `_amount`; note: some tokens may get burnt here
        IERC20(poolToken).safeTransferFrom(address(msg.sender), address(this), _value);
        // read new balance, usually this is just the difference `previousBalance - _amount`
        uint256 newBalance = IERC20(poolToken).balanceOf(address(this));
        // calculate real amount taking into account deflation
        uint256 addedAmount = newBalance - previousBalance;

        // no need to calculate locking weight, flexible stake never locks
        uint256 stakeWeight = WEIGHT_MULTIPLIER * addedAmount;

        // makes sure stakeWeight is valid
        assert(stakeWeight > 0);

        // create and save the deposit (append it to deposits array)
        Stake.Data memory deposit = Stake.Data({
            value: addedAmount,
            lockedFrom: 0,
            lockedUntil: 0,
            isYield: _isYield
        });
        // deposit ID is an index of the deposit in `deposits` array
        user.stakes.push(deposit);

        // update user record
        user.flexibleTokenAmount += addedAmount;
        user.totalWeight += stakeWeight;
        user.subYieldRewards = _weightToReward(user.totalWeight, yieldRewardsPerWeight);

        // update global variable
        usersLockingWeight += stakeWeight;

        // emit an event
        emit Staked(msg.sender, _staker, _amount);
    }

    /**
     * @dev migrates msg.sender data to a new address
     *
     * @notice data is copied to memory so we can delete previous address data
     * before we store it in new address
     *
     * @param _to new user address
     */
    function migrateUser(address _to) external {
        User storage newUser = users[_to];
        require(newUser.stakes.length == 0 && newUser.v1Stakes.length == 0, "invalid user, already exists");

        User memory previousUser = users[msg.sender];
        delete users[msg.sender];
        newUser = previousUser;

        emit LogMigrateUser(msg.sender, _to);
    }

    /**
     * @notice Unstakes specified amount of tokens, and pays pending yield rewards if any
     *
     * @dev Requires amount to unstake to be greater than zero
     *
     * @param _depositId deposit ID to unstake from, zero-indexed
     * @param _amount amount of tokens to unstake
     * @param _useSILV a flag indicating if reward to be paid as sILV
     */
    function unstake(
        uint256 _depositId,
        uint256 _amount,
        bool _useSILV
    ) external override {
        // delegate call to an internal function
        _unstake(msg.sender, _depositId, _amount, _useSILV);
    }

    /**
     * @notice Extends locking period for a given deposit
     *
     * @dev Requires new lockedUntil value to be:
     *      higher than the current one, and
     *      in the future, but
     *      no more than 1 year in the future
     *
     * @param depositId updated deposit ID
     * @param lockedUntil updated deposit locked until value
     * @param useSILV used for _processRewards check if it should use ILV or sILV
     */
    function updateStakeLock(
        uint256 depositId,
        uint64 lockedUntil,
        bool useSILV
    ) external updatePool {
        _processRewards(msg.sender, useSILV, false);
        // delegate call to an internal function
        _updateStakeLock(msg.sender, depositId, lockedUntil);
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

    /**
     * @notice Service function to calculate and pay pending yield rewards to the sender
     *
     * @dev Can be executed by anyone at any time, but has an effect only when
     *      executed by deposit holder and when at least one second passes from the
     *      previous reward processing
     * @dev Executed internally when staking and unstaking, executes sync() under the hood
     *      before making further calculations and payouts
     * @dev When timing conditions are not met (executed too frequently, or after factory
     *      end time), function doesn't throw and exits silently
     *
     * @param _useSILV flag indicating whether to mint sILV token as a reward or not;
     *      when set to true - sILV reward is minted immediately and sent to sender,
     *      when set to false - new ILV reward deposit gets created if pool is an ILV pool
     *      (poolToken is ILV token), or new pool deposit gets created together with sILV minted
     *      when pool is not an ILV pool (poolToken is not an ILV token)
     */
    function processRewards(bool _useSILV) external virtual override {
        // delegate call to an internal function
        _processRewards(msg.sender, _useSILV, true);
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

        // emit an event logging old and new weight values
        emit PoolWeightUpdated(msg.sender, weight, _weight);

        // set the new weight value
        weight = _weight;
    }

    /**
     * @dev Similar to public pendingYieldRewards, but performs calculations based on
     *      current smart contract state only, not taking into account any additional
     *      time which might have passed
     *
     * @param _staker an address to calculate yield rewards value for
     * @return pending calculated yield reward value for the given address
     */
    function _pendingYieldRewards(address _staker) internal view returns (uint256 pending) {
        // read user data structure into memory
        User storage user = users[_staker];

        // and perform the calculation using the values read
        return _weightToReward(user.totalWeight, yieldRewardsPerWeight) - user.subYieldRewards;
    }

    /**
     * @dev Used internally, mostly by children implementations, see stake()
     *
     * @param _staker an address which stakes tokens and which will receive them back
     * @param _amount amount of tokens to stake
     * @param _lockUntil stake period as unix timestamp; zero means no locking
     * @param _useSILV a flag indicating if previous reward to be paid as sILV
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
        require(_value > 0, "zero amount");
        require(
            _lockUntil == 0 || (_lockUntil > _now256() && _lockUntil - _now256() <= 365 days),
            "invalid lock interval"
        );

        // get a link to user data struct, we will write to it later
        User storage user = users[_staker];
        // process current pending rewards if any
        if (user.totalWeight > 0) {
            _processRewards(_staker, _useSILV, false);
        }

        // in most of the cases added amount `addedAmount` is simply `_value`
        // however for deflationary tokens this can be different

        // read the current balance
        uint256 previousBalance = IERC20(poolToken).balanceOf(address(this));
        // transfer `_value`; note: some tokens may get burnt here
        IERC20(poolToken).safeTransferFrom(address(msg.sender), address(this), _value);
        // read new balance, usually this is just the difference `previousBalance - _value`
        uint256 newBalance = IERC20(poolToken).balanceOf(address(this));
        // calculate real amount taking into account deflation
        uint256 addedAmount = newBalance - previousBalance;

        // set the `lockFrom` and `lockUntil` taking into account that
        // zero value for `_lockUntil` means "no locking" and leads to zero values
        // for both `lockFrom` and `lockUntil`
        uint64 lockFrom = _lockUntil > 0 ? uint64(_now256()) : 0;
        uint64 lockUntil = _lockUntil;

        // stake weight formula rewards for locking
        uint256 stakeWeight = (((lockUntil - lockFrom) * WEIGHT_MULTIPLIER) / 365 days + WEIGHT_MULTIPLIER) *
            addedAmount;

        // makes sure stakeWeight is valid
        assert(stakeWeight > 0);

        // create and save the deposit (append it to deposits array)
        Stake.Data memory deposit = Stake.Data({
            value: addedAmount,
            lockedFrom: lockFrom,
            lockedUntil: lockUntil,
            isYield: _isYield
        });
        // deposit ID is an index of the deposit in `deposits` array
        user.stakes.push(deposit);

        // update user record
        user.totalWeight += stakeWeight;
        user.subYieldRewards = _weightToReward(user.totalWeight, yieldRewardsPerWeight);

        // update global variable
        usersLockingWeight += stakeWeight;

        // emit an event
        emit Staked(msg.sender, _staker, _value);
    }

    /**
     * @dev Used internally, mostly by children implementations, see unstake()
     *
     * @param _staker an address which unstakes tokens (which previously staked them)
     * @param _depositId deposit ID to unstake from, zero-indexed
     * @param _amount amount of tokens to unstake
     * @param _useSILV a flag indicating if reward to be paid as sILV
     */
    function _unstake(
        address _staker,
        uint256 _depositId,
        uint256 _amount,
        bool _useSILV
    ) internal virtual updatePool {
        // verify an amount is set
        require(_amount > 0, "zero amount");

        // get a link to user data struct, we will write to it later
        User storage user = users[_staker];
        // get a link to the corresponding deposit, we may write to it later
        Stake storage stakeDeposit = user.stakes[_depositId];
        // deposit structure may get deleted, so we save isYield flag to be able to use it
        bool isYield = stakeDeposit.isYield;

        // verify available balance
        // if staker address ot deposit doesn't exist this check will fail as well
        require(stakeDeposit.tokenAmount >= _amount, "amount exceeds stake");

        // and process current pending rewards if any
        _processRewards(_staker, _useSILV, false);

        // recalculate deposit weight
        uint256 previousWeight = stakeDeposit.weight(WEIGHT_MULTIPLIER);

        // update the deposit, or delete it if its depleted
        if (stakeDeposit.tokenAmount - _amount == 0) {
            delete user.stakes[_depositId];
        } else {
            stakeDeposit.tokenAmount -= _amount;
        }

        // update user record
        user.tokenAmount -= _amount;
        user.totalWeight = user.totalWeight - previousWeight + newWeight;
        user.subYieldRewards = _weightToReward(user.totalWeight, yieldRewardsPerWeight);

        // update global variable
        usersLockingWeight = usersLockingWeight - previousWeight + newWeight;

        // if the deposit was created by the pool itself as a yield reward
        if (isYield) {
            // mint the yield via the factory
            factory.mintYieldTo(msg.sender, _amount, false);
        } else {
            // otherwise just return tokens back to holder
            IERC20(poolToken).safeTransfer(msg.sender, _amount);
        }

        // emit an event
        emit Unstaked(msg.sender, _staker, _amount);
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
        if (usersLockingWeight == 0) {
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
        yieldRewardsPerWeight += _rewardPerWeight(ilvReward, usersLockingWeight);
        lastYieldDistribution = uint64(currentTimestamp);

        // emit an event
        emit Synchronized(msg.sender, yieldRewardsPerWeight, lastYieldDistribution);
    }

    /**
     * @dev Used internally, mostly by children implementations, see processRewards()
     *
     * @param _staker an address which receives the reward (which has staked some tokens earlier)
     * @param _useSILV flag indicating whether to mint sILV token as a reward or not, see processRewards()
     * @param _withUpdate flag allowing to disable synchronization (see sync()) if set to false
     * @return pendingYield the rewards calculated and optionally re-staked
     */
    function _processRewards(
        address _staker,
        bool _useSILV,
        bool _withUpdate
    ) internal virtual returns (uint256 pendingYield) {
        // update smart contract state if required
        if (_withUpdate) {
            _sync();
        }

        // calculate pending yield rewards, this value will be returned
        pendingYield = _pendingYieldRewards(_staker);

        // if pending yield is zero - just return silently
        if (pendingYield == 0) return 0;

        // get link to a user data structure, we will write into it later
        User storage user = users[_staker];

        // if sILV is requested
        if (_useSILV) {
            // - mint sILV
            factory.mintYieldTo(_staker, pendingYield, true);
        } else if (poolToken == ilv) {
            // calculate pending yield weight,
            // 2e6 is the bonus weight when staking for 1 year
            uint256 depositWeight = pendingYield * YEAR_STAKE_WEIGHT_MULTIPLIER;

            // if the pool is ILV Pool - create new ILV deposit
            // and save it - push it into deposits array
            Stake.Data memory newDeposit = Stake.Data({
                value: pendingYield,
                lockedFrom: uint64(_now256()),
                lockedUntil: uint64(_now256() + 365 days), // staking yield for 1 year
                isYield: true
            });
            user.stakes.push(newDeposit);

            // update user record
            user.tokenAmount += pendingYield;
            user.totalWeight += depositWeight;

            // update global variable
            usersLockingWeight += depositWeight;
        } else {
            // for other pools - stake as pool
            address ilvPool = factory.getPoolAddress(ilv);
            ICorePool(ilvPool).stakeAsPool(_staker, pendingYield);
        }

        // update users's record for `subYieldRewards` if requested
        if (_withUpdate) {
            user.subYieldRewards = _weightToReward(user.totalWeight, yieldRewardsPerWeight);
        }

        // emit an event
        emit YieldClaimed(msg.sender, _staker, _useSILV, pendingYield);
    }

    /**
     * @dev See updateStakeLock()
     *
     * @param _staker an address to update stake lock
     * @param _depositId updated deposit ID
     * @param _lockedUntil updated deposit locked until value
     */
    function _updateStakeLock(
        address _staker,
        uint256 _depositId,
        uint64 _lockedUntil
    ) internal {
        // validate the input time
        require(_lockedUntil > _now256(), "lock should be in the future");

        // get a link to user data struct, we will write to it later
        User storage user = users[_staker];
        // get a link to the corresponding deposit, we may write to it later
        Stake storage stakeDeposit = user.stakes[_depositId];

        // validate the input against deposit structure
        require(_lockedUntil > stakeDeposit.lockedUntil, "invalid new lock");

        // verify locked from and locked until values
        if (stakeDeposit.lockedFrom == 0) {
            require(_lockedUntil - _now256() <= 365 days, "max lock period is 365 days");
            stakeDeposit.lockedFrom = uint64(_now256());
        } else {
            require(_lockedUntil - stakeDeposit.lockedFrom <= 365 days, "max lock period is 365 days");
        }

        // update locked until value, calculate new weight
        stakeDeposit.lockedUntil = _lockedUntil;
        uint256 newWeight = (((stakeDeposit.lockedUntil - stakeDeposit.lockedFrom) * WEIGHT_MULTIPLIER) /
            365 days +
            WEIGHT_MULTIPLIER) * stakeDeposit.tokenAmount;

        // update user total weight and global locking weight
        user.totalWeight = user.totalWeight - previousWeight + newWeight;
        usersLockingWeight = usersLockingWeight - previousWeight + newWeight;

        // emit an event
        emit StakeLockUpdated(_staker, _depositId, stakeDeposit.lockedFrom, _lockedUntil);
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
        return (_weight * rewardPerWeight) / REWARD_PER_WEIGHT_MULTIPLIER;
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
