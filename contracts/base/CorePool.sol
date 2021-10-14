// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { IERC20, SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { Timestamp } from "./Timestamp.sol";
import { VaultRecipient } from "./VaultRecipient.sol";
import { Errors } from "../libraries/Errors.sol";
import { Stake } from "../libraries/Stake.sol";
import { IILVPool } from "../interfaces/IILVPool.sol";
import { IFactory } from "../interfaces/IFactory.sol";
import { ICorePoolV1 } from "../interfaces/ICorePoolV1.sol";

import "hardhat/console.sol";

abstract contract CorePool is
    UUPSUpgradeable,
    VaultRecipient,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    Timestamp
{
    using SafeERC20 for IERC20;
    using Stake for Stake.Data;
    using Errors for bytes4;
    using Stake for uint256;

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

    struct UnstakeParameter {
        uint256 stakeId;
        uint256 value;
    }

    /// @dev Token holder storage, maps token holder address to their data record
    mapping(address => User) public users;

    /// @dev maps `keccak256(userAddress,stakeId)` to a uint256 value that tells
    ///      a v1 locked stake weight that has already been migrated to v2
    mapping(address => mapping(uint256 => uint256)) public v1StakesMigrated;

    /// @dev Link to sILV ERC20 Token instance
    address public silv;

    /// @dev Link to ILV ERC20 Token instance
    address public ilv;

    /// @dev Link to the pool token instance, for example ILV or ILV/ETH pair
    address public poolToken;

    /// @dev address of v1 core pool with same poolToken
    address public corePoolV1;

    /// @dev Pool weight, initial values are 200 for ILV pool and 800 for ILV/ETH
    uint32 public weight;

    /// @dev Timestamp of the last yield distribution event
    uint64 public lastYieldDistribution;

    /// @dev Used to calculate yield rewards
    /// @dev This value is different from "reward per token" used in flash pool
    /// @dev Note: stakes are different in duration and "weight" reflects that
    uint256 public yieldRewardsPerWeight;

    /// @dev Used to calculate yield rewards, keeps track of the tokens weight locked in staking
    uint256 public globalWeight;

    /// @dev Pool tokens value available in the pool;
    ///      pool token examples are ILV (ILV core pool) or ILV/ETH pair (LP core pool)
    /// @dev For LP core pool this value doesnt' count for ILV tokens received as Vault rewards
    ///      while for ILV core pool it does count for such tokens as well
    uint256 public poolTokenReserve;

    /// @dev Flag indicating pool type, false means "core pool"
    bool public constant isFlashPool = false;

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
     * @dev Fired in unstakeFlexible()
     *
     * @param to address receiving the tokens (user)
     * @param totalValue number of tokens unstaked
     * @param unstakingYield whether function call was to mint ILV (yield) or not
     */
    event LogUnstakeLockedMultiple(address indexed to, uint256 totalValue, bool unstakingYield);

    /**
     * @dev Fired in unstakeLocked()
     *
     * @param to address receiving the tokens (user)
     * @param stakeId id value of the stake
     * @param value number of tokens unstaked
     * @param isYield whether stake struct unstaked was coming from yield or not
     */
    event LogUnstakeLocked(address indexed to, uint256 stakeId, uint256 value, bool isYield);

    /**
     * @dev Fired in _sync(), sync() and dependent functions (stake, unstake, etc.)
     *
     * @param by an address which performed an operation
     * @param yieldRewardsPerWeight updated yield rewards per weight value
     * @param lastYieldDistribution usually, current timestamp
     */
    event LogSync(address indexed by, uint256 yieldRewardsPerWeight, uint64 lastYieldDistribution);

    /**
     * @dev Fired in _claimYieldRewards()
     *
     * @param from an address which received the yield
     * @param sILV flag indicating if reward was paid (minted) in sILV
     * @param value value of yield paid
     */
    event LogClaimYieldRewards(address indexed from, bool sILV, uint256 value);

    /**
     * @dev Fired in _claimVaultRewards()
     *
     * @param from an address which received the yield
     * @param value value of yield paid
     */
    event LogClaimVaultRewards(address indexed from, uint256 value);

    /**
     * @dev Fired in _processRewards()
     *
     * @param from an address which received the yield
     * @param yieldValue value of yield processed
     * @param revDisValue value of revenue distribution processed
     */
    event LogProcessRewards(address indexed from, uint256 yieldValue, uint256 revDisValue);

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

    /**
     * @dev Fired in receiveVaultRewards()
     *
     * @param by an address that sent the rewards, always a vault
     * @param value amount of tokens received
     */
    event LogReceiveVaultRewards(address indexed by, uint256 value);

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
     * @param _factory PoolFactory contract address
     * @param _initTime initial timestamp used to calculate the rewards
     *      note: _initTime is set to the future effectively meaning _sync() calls will do nothing
     *           before _initTime
     * @param _weight number representing the pool's weight, which in _sync calls
     *        is used by checking the total pools weight in the PoolFactory contract
     */
    function __CorePool_init(
        address _ilv,
        address _silv,
        address _poolToken,
        address _factory,
        uint64 _initTime,
        uint32 _weight
    ) internal initializer {
        // we're using selector to simplify input and state validation
        // since function is not public we pre-calculate the selector
        bytes4 fnSelector = 0x243f7620;
        // verify the inputs
        fnSelector.verifyNonZeroInput(uint160(_poolToken), 2);
        fnSelector.verifyNonZeroInput(_initTime, 4);
        fnSelector.verifyNonZeroInput(_weight, 5);

        __FactoryControlled_init(_factory);
        __ReentrancyGuard_init();
        __Pausable_init();

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
     * @dev see _pendingRewards() for further details
     *
     * @dev external pendingRewards() returns pendingYield and pendingRevDis
     *         accumulated with already stored user.pendingYield and user.pendingRevDis
     *
     * @param _staker an address to calculate yield rewards value for
     */
    function pendingRewards(address _staker) external view returns (uint256 pendingYield, uint256 pendingRevDis) {
        CorePool(this).pendingRewards.selector.verifyNonZeroInput(uint160(_staker), 0);
        // `newYieldRewardsPerWeight` will store stored or recalculated value for `yieldRewardsPerWeight`
        uint256 newYieldRewardsPerWeight;
        // gas savings
        uint256 _lastYieldDistribution = lastYieldDistribution;
        // if smart contract state was not updated recently, `yieldRewardsPerWeight` value
        // is outdated and we need to recalculate it in order to calculate pending rewards correctly
        if (_now256() > _lastYieldDistribution && globalWeight != 0) {
            uint256 endTime = factory.endTime();
            uint256 multiplier = _now256() > endTime
                ? endTime - _lastYieldDistribution
                : _now256() - _lastYieldDistribution;
            uint256 ilvRewards = (multiplier * weight * factory.ilvPerSecond()) / factory.totalWeight();
            uint256 v1GlobalWeight = ICorePoolV1(corePoolV1).usersLockingWeight();

            // recalculated value for `yieldRewardsPerWeight`
            newYieldRewardsPerWeight =
                ilvRewards.rewardPerWeight((globalWeight + v1GlobalWeight)) +
                yieldRewardsPerWeight;
        } else {
            // if smart contract state is up to date, we don't recalculate
            newYieldRewardsPerWeight = yieldRewardsPerWeight;
        }

        // based on the rewards per weight value, calculate pending rewards;
        User storage user = users[_staker];

        (uint256 v1StakesLength, uint256 userWeight) = (uint256(user.v1IdsLength), uint256(user.totalWeight));

        uint256 totalV1Weight;
        uint256 previousTotalV1Weight;

        if (v1StakesLength > 0) {
            // loops through v1StakesIds and adds v1 weight with V1_WEIGHT_BONUS
            for (uint256 i = 0; i < v1StakesLength; i++) {
                // saves v1 stake id to memory
                uint256 stakeId = user.v1StakesIds[i];
                (, uint256 _weight, , , ) = ICorePoolV1(corePoolV1).getDeposit(_staker, stakeId);

                uint256 storedWeight = v1StakesMigrated[_staker][stakeId];

                previousTotalV1Weight += storedWeight;
                totalV1Weight += _weight <= storedWeight ? _weight : storedWeight;
            }
        }

        uint256 subYieldRewardsStored = user.subYieldRewards;
        uint256 subVaultRewardsStored = user.subVaultRewards;
        uint256 subYieldRewards;
        uint256 subVaultRewards;

        if (previousTotalV1Weight != totalV1Weight) {
            uint256 totalWeightStored = user.totalWeight;

            // gets subYieldRewards value to be used for yield calculations
            // during execution
            subYieldRewards = _getSubRewardsValue(
                subYieldRewardsStored,
                totalWeightStored,
                totalV1Weight,
                previousTotalV1Weight
            );
            // gets subVaultRewards value to be used for revenue distribution
            // calculations during execution
            subVaultRewards = _getSubRewardsValue(
                subVaultRewardsStored,
                totalWeightStored,
                totalV1Weight,
                previousTotalV1Weight
            );
        } else {
            subYieldRewards = subYieldRewardsStored;
            subVaultRewards = subVaultRewardsStored;
        }

        pendingYield =
            ((userWeight + totalV1Weight).weightToReward(newYieldRewardsPerWeight) - subYieldRewards) +
            user.pendingYield;
        pendingRevDis =
            ((userWeight + totalV1Weight).weightToReward(vaultRewardsPerWeight) - subVaultRewards) +
            user.pendingRevDis;
    }

    /**
     * @notice Returns total staked token balance for the given address
     *
     * @param _user an address to query balance for
     * @return balance total staked token balance
     */
    function balanceOf(address _user) external view returns (uint256 balance) {
        User storage user = users[_user];
        uint256 balanceInStakes;

        for (uint256 i = 0; i < user.stakes.length; i++) {
            balanceInStakes += user.stakes[i].value;
        }

        balance = balanceInStakes + user.flexibleBalance;
    }

    /**
     * @notice Returns information on the given stake for the given address
     *
     * @dev See getStakesLength
     *
     * @param _user an address to query stake for
     * @param _stakeId zero-indexed stake ID for the address specified
     * @return stake info as Stake structure
     */
    function getStake(address _user, uint256 _stakeId) external view returns (Stake.Data memory) {
        // read stake at specified index and return
        return users[_user].stakes[_stakeId];
    }

    /**
     * @notice Returns a v1 stake id in the `user.v1StakesIds` array
     *
     *
     * @param _user an address to query stake for
     * @param _position position index in the array
     * @return stakeId value
     */
    function getV1StakeId(address _user, uint256 _position) external view returns (uint256) {
        return users[_user].v1StakesIds[_position];
    }

    /**
     * @notice Returns a v1 stake position in the `user.v1StakesIds` array
     *
     * @dev helper function to call getV1StakeId()
     *
     * @param _user an address to query stake for
     * @param _desiredId desired stakeId position in the array to find
     * @return position stake info as Stake structure
     */
    function getV1StakePosition(address _user, uint256 _desiredId) external view returns (uint256 position) {
        User storage user = users[_user];

        for (uint256 i = 0; i < user.v1IdsLength; i++) {
            if (user.v1StakesIds[i] == _desiredId) {
                return i;
            }
        }

        return 0;
    }

    /**
     * @notice Returns number of stakes for the given address. Allows iteration over stakes.
     *
     * @dev See getStake
     *
     * @param _user an address to query stake length for
     * @return number of stakes for the given address
     */
    function getStakesLength(address _user) external view returns (uint256) {
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
     * @param _lockDuration stake duration as unix timestamp
     */
    function stakeAndLock(uint256 _value, uint64 _lockDuration) external nonReentrant {
        _requireNotPaused();
        // delegate call to an internal function
        _stakeAndLock(msg.sender, _value, _lockDuration);
    }

    /**
     * @dev stakes poolTokens without lock
     * @dev we use standard weight for flexible stakes (since it's never locked)
     *
     * @param _value number of tokens to stake
     */
    function stakeFlexible(uint256 _value) external updatePool nonReentrant {
        _requireNotPaused();

        // validate input is set
        CorePool(this).stakeFlexible.selector.verifyNonZeroInput(_value, 0);

        // get a link to user data struct, we will write to it later
        User storage user = users[msg.sender];
        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);

        // process current pending rewards if any
        if (user.totalWeight > 0) {
            _processRewards(msg.sender, v1WeightToAdd, subYieldRewards, subVaultRewards);
        }

        // no need to calculate locking weight, flexible stake never locks
        uint256 stakeWeight = Stake.WEIGHT_MULTIPLIER * _value;

        // makes sure stakeWeight is valid
        assert(stakeWeight > 0);

        // update user record
        user.flexibleBalance += uint128(_value);
        user.totalWeight += uint248(stakeWeight);
        user.subYieldRewards = uint256((user.totalWeight + v1WeightToAdd)).weightToReward(yieldRewardsPerWeight);
        user.subVaultRewards = uint256((user.totalWeight + v1WeightToAdd)).weightToReward(vaultRewardsPerWeight);

        // update global variable
        globalWeight += stakeWeight;
        // update reserve count
        poolTokenReserve += _value;

        // transfer `_value`
        IERC20(poolToken).safeTransferFrom(address(msg.sender), address(this), _value);

        // emit an event
        emit LogStakeFlexible(msg.sender, _value);
    }

    /**
     * @dev migrates msg.sender data to a new address
     * @dev v1 stakes are never migrated to the new address. We process all rewards,
     *      clean the previous user (msg.sender), add the previous user data to
     *      the desired address and update subYieldRewards/subVaultRewards values
     *      in order to make sure both addresses will have rewards cleaned
     *
     * @param _to new user address, needs to be a fresh address with no stakes
     */
    function migrateUser(address _to) external updatePool {
        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);
        // we process all pending rewards before migration
        _processRewards(msg.sender, v1WeightToAdd, subYieldRewards, subVaultRewards);
        // we're using selector to simplify input and state validation
        bytes4 fnSelector = CorePool(this).migrateUser.selector;

        // validate input is set
        fnSelector.verifyNonZeroInput(uint160(_to), 0);
        User storage newUser = users[_to];

        // verify new user records are empty
        fnSelector.verifyState(
            newUser.totalWeight == 0 &&
                newUser.v1IdsLength == 0 &&
                newUser.subYieldRewards == 0 &&
                newUser.subVaultRewards == 0,
            0
        );

        User storage previousUser = users[msg.sender];
        newUser.flexibleBalance = previousUser.flexibleBalance;
        newUser.pendingYield = previousUser.pendingYield;
        newUser.totalWeight = previousUser.totalWeight;
        newUser.subYieldRewards = uint256(previousUser.totalWeight).weightToReward(yieldRewardsPerWeight);
        newUser.subVaultRewards = uint256(previousUser.totalWeight).weightToReward(vaultRewardsPerWeight);
        delete previousUser.flexibleBalance;
        delete previousUser.pendingYield;
        delete previousUser.totalWeight;
        delete previousUser.stakes;

        previousUser.subYieldRewards = v1WeightToAdd.weightToReward(yieldRewardsPerWeight);
        previousUser.subVaultRewards = v1WeightToAdd.weightToReward(vaultRewardsPerWeight);

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
        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);
        _processRewards(msg.sender, v1WeightToAdd, subYieldRewards, subVaultRewards);

        // we're using selector to simplify input and state validation
        bytes4 fnSelector = CorePool(this).updateStakeLock.selector;

        // validate the input time
        fnSelector.verifyInput(_lockedUntil > _now256(), 1);

        // get a link to user data struct, we will write to it later
        User storage user = users[msg.sender];
        // get a link to the corresponding stake, we may write to it later
        Stake.Data storage stake = user.stakes[_stakeId];

        // validate the input against stake structure
        fnSelector.verifyInput(_lockedUntil > stake.lockedUntil, 1);

        // saves previous weight into memory
        uint256 previousWeight = stake.weight();
        // gas savings
        uint64 stakeLockedFrom = stake.lockedFrom;

        // verify locked from and locked until values
        if (stakeLockedFrom == 0) {
            fnSelector.verifyInput(_lockedUntil - _now256() <= 730 days, 1);
            stakeLockedFrom = uint64(_now256());
            stake.lockedFrom = stakeLockedFrom;
        } else {
            fnSelector.verifyInput(_lockedUntil - stakeLockedFrom <= 730 days, 1);
        }

        // update locked until value, calculate new weight
        stake.lockedUntil = _lockedUntil;
        // saves new weight into memory
        uint256 newWeight = stake.weight();
        // update user total weight and global locking weight
        user.totalWeight = uint248(user.totalWeight - previousWeight + newWeight);
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
    function sync() external {
        // delegate call to an internal function
        _sync();
    }

    /**
     * @dev calls internal _claimYieldRewards() passing `msg.sender` as `_staker`
     *
     * @notice pool state is updated before calling the internal function
     */
    function claimYieldRewards(bool _useSILV) external updatePool {
        _requireNotPaused();
        _claimYieldRewards(msg.sender, _useSILV);
    }

    /**
     * @dev calls internal _claimVaultRewards() passing `msg.sender` as `_staker`
     *
     * @notice pool state is updated before calling the internal function
     */
    function claimVaultRewards() external updatePool {
        _requireNotPaused();
        _claimVaultRewards(msg.sender);
    }

    /**
     * @dev Executed by the vault to transfer vault rewards ILV from the vault
     *      into the pool
     *
     * @dev This function is executed only for ILV core pools
     *
     * @param _value amount of ILV rewards to transfer into the pool
     */
    function receiveVaultRewards(uint256 _value) external updatePool {
        // checks if msg.sender is the vault contract
        _requireIsVault();
        // we're using selector to simplify input and state validation
        bytes4 fnSelector = CorePool(this).receiveVaultRewards.selector;

        // return silently if there is no reward to receive
        if (_value == 0) {
            return;
        }
        // verify weight is not zero
        fnSelector.verifyState(globalWeight > 0, 0);

        vaultRewardsPerWeight += _value.rewardPerWeight(globalWeight);

        IERC20(ilv).safeTransferFrom(msg.sender, address(this), _value);

        emit LogReceiveVaultRewards(msg.sender, _value);
    }

    /**
     * @dev Executed by the factory to modify pool weight; the factory is expected
     *      to keep track of the total pools weight when updating
     *
     * @dev Set weight to zero to disable the pool
     *
     * @param _weight new weight to set for the pool
     */
    function setWeight(uint32 _weight) external {
        // verify function is executed by the factory
        CorePool(this).setWeight.selector.verifyAccess(msg.sender == address(factory));

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
     * @notice v1 weight is kept the same used in v1, as a bonus to V1 stakers
     *
     * @notice pending values retured are used by _processRewards() calls, which means
     *         we aren't counting user.pendingYield and user.pendingRevDis here
     *
     * @param _staker an address to calculate yield rewards value for
     * @param _totalV1Weight v1 weight used in calculations
     * @param _subYieldRewards value subtracted for yield calculation
     */
    function _pendingRewards(
        address _staker,
        uint256 _totalV1Weight,
        uint256 _subYieldRewards,
        uint256 _subVaultRewards
    ) internal view returns (uint256 pendingYield, uint256 pendingRevDis) {
        // links to _staker user struct in storage
        User storage user = users[_staker];

        // gas savings
        uint256 userWeight = uint256(user.totalWeight);

        pendingYield = (userWeight + _totalV1Weight).weightToReward(yieldRewardsPerWeight) - _subYieldRewards;
        pendingRevDis = (userWeight + _totalV1Weight).weightToReward(vaultRewardsPerWeight) - _subVaultRewards;
    }

    /**
     * @dev Used internally, mostly by children implementations, see stake()
     *
     * @param _staker an address which stakes tokens and which will receive them back
     * @param _value value of tokens to stake
     * @param _lockDuration stake period as unix timestamp; zero means no locking
     */
    function _stakeAndLock(
        address _staker,
        uint256 _value,
        uint64 _lockDuration
    ) internal virtual updatePool {
        // we're using selector to simplify input and state validation
        // since function is not public we pre-calculate the selector
        bytes4 fnSelector = 0x867a0347;

        // validate the inputs
        fnSelector.verifyNonZeroInput(_value, 0);
        fnSelector.verifyInput(_lockDuration > 0 && _lockDuration <= 730 days, 2);

        // get a link to user data struct, we will write to it later
        User storage user = users[_staker];

        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);

        // process current pending rewards if any
        if (user.totalWeight > 0 || v1WeightToAdd > 0) {
            _processRewards(_staker, v1WeightToAdd, subYieldRewards, subVaultRewards);
        }

        uint64 lockUntil = uint64(_now256()) + _lockDuration;

        // stake weight formula rewards for locking
        uint256 stakeWeight = (((lockUntil - _now256()) * Stake.WEIGHT_MULTIPLIER) /
            730 days +
            Stake.WEIGHT_MULTIPLIER) * _value;

        // makes sure stakeWeight is valid
        assert(stakeWeight > 0);

        // create and save the stake (append it to stakes array)
        Stake.Data memory stake = Stake.Data({
            value: uint120(_value),
            lockedFrom: uint64(_now256()),
            lockedUntil: lockUntil,
            isYield: false
        });
        // stake ID is an index of the stake in `stakes` array
        user.stakes.push(stake);

        // update user record
        user.totalWeight += uint248(stakeWeight);
        user.subYieldRewards = uint256((user.totalWeight + v1WeightToAdd)).weightToReward(yieldRewardsPerWeight);
        user.subVaultRewards = uint256((user.totalWeight + v1WeightToAdd)).weightToReward(vaultRewardsPerWeight);

        // update global variable
        globalWeight += stakeWeight;
        // update reserve count
        poolTokenReserve += _value;

        // transfer `_value`
        IERC20(poolToken).safeTransferFrom(address(msg.sender), address(this), _value);

        // emit an event
        emit LogStakeAndLock(msg.sender, _value, lockUntil);
    }

    /**
     * @dev unstake poolTokens that have been staked in flexible mode
     *
     * @param _value number of tokens to unstake
     */

    function unstakeFlexible(uint256 _value) external updatePool {
        // we're using selector to simplify input and state validation
        bytes4 fnSelector = CorePool(this).unstakeFlexible.selector;

        // verify a value is set
        fnSelector.verifyNonZeroInput(_value, 0);
        // get a link to user data struct, we will write to it later
        User storage user = users[msg.sender];
        // verify available balance
        fnSelector.verifyInput(user.flexibleBalance >= _value, 0);

        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);
        // and process current pending rewards if any
        _processRewards(msg.sender, v1WeightToAdd, subYieldRewards, subVaultRewards);

        // updates user data in storage
        user.flexibleBalance -= uint128(_value);
        user.totalWeight -= uint248(_value * Stake.WEIGHT_MULTIPLIER);
        // update reserve count
        poolTokenReserve -= _value;

        // finally, transfers `_value` poolTokens
        IERC20(poolToken).safeTransfer(msg.sender, _value);

        // emit an event
        emit LogUnstakeFlexible(msg.sender, _value);
    }

    /**
     * @dev Unstakes a stake that has been previously locked, and is now in an unlocked
     *      state. If the stake has the isYield flag set to true, then the contract
     *      requests ILV to be minted by the PoolFactory. Otherwise it transfers ILV or LP
     *      from the contract balance
     *
     * @param _stakeId stake ID to unstake from, zero-indexed
     * @param _value value of tokens to unstake
     */
    function unstakeLocked(uint256 _stakeId, uint256 _value) external updatePool {
        // we're using selector to simplify input and state validation
        bytes4 fnSelector = CorePool(this).unstakeLocked.selector;

        // verify a value is set
        fnSelector.verifyNonZeroInput(_value, 0);
        // get a link to user data struct, we will write to it later
        User storage user = users[msg.sender];
        // get a link to the corresponding stake, we may write to it later
        Stake.Data storage stake = user.stakes[_stakeId];
        // checks if stake is unlocked already
        fnSelector.verifyState(_now256() > stake.lockedUntil, 0);
        // stake structure may get deleted, so we save isYield flag to be able to use it
        // we also save stakeValue for gasSavings
        (uint120 stakeValue, bool isYield) = (stake.value, stake.isYield);
        // verify available balance
        fnSelector.verifyInput(stakeValue >= _value, 1);

        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);
        // and process current pending rewards if any
        _processRewards(msg.sender, v1WeightToAdd, subYieldRewards, subVaultRewards);

        // store stake weight
        uint256 previousWeight = stake.weight();
        // value used to save new weight after updates in storage
        uint256 newWeight;

        // update the stake, or delete it if its depleted
        if (stakeValue - _value == 0) {
            // deletes stake struct, no need to save new weight because it stays 0
            delete user.stakes[_stakeId];
        } else {
            stake.value -= uint120(_value);
            // saves new weight to memory
            newWeight = stake.weight();
        }

        // update user record
        user.totalWeight = uint248(user.totalWeight - previousWeight + newWeight);
        user.subYieldRewards = uint256((user.totalWeight + v1WeightToAdd)).weightToReward(yieldRewardsPerWeight);
        user.subVaultRewards = uint256((user.totalWeight + v1WeightToAdd)).weightToReward(vaultRewardsPerWeight);

        // update global variable
        globalWeight = globalWeight - previousWeight + newWeight;
        // update reserve count
        poolTokenReserve -= _value;

        // if the stake was created by the pool itself as a yield reward
        if (isYield) {
            // mint the yield via the factory
            factory.mintYieldTo(msg.sender, _value, false);
        } else {
            // otherwise just return tokens back to holder
            IERC20(poolToken).safeTransfer(msg.sender, _value);
        }

        // emit an event
        emit LogUnstakeLocked(msg.sender, _stakeId, _value, isYield);
    }

    /**
     * @dev Executes unstake on multiple stakeIds. See unstakeLocked()
     * @dev Optimizes gas by requiring all unstakes to be made either in yield stakes
     *      or in non yield stakes. That way we can transfer or mint tokens in one call.
     *
     * @param _stakes array of stakeIds and values to be unstaked in each stake from
     *                the msg.sender
     * @param _unstakingYield whether all stakeIds have isYield flag set to true or false,
     *                        i.e if we're minting ILV or transferring pool tokens
     */
    function unstakeLockedMultiple(UnstakeParameter[] calldata _stakes, bool _unstakingYield) external {
        // we're using selector to simplify input and state validation
        bytes4 fnSelector = CorePool(this).unstakeLockedMultiple.selector;

        fnSelector.verifyNonZeroInput(_stakes.length, 0);
        User storage user = users[msg.sender];

        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);
        _processRewards(msg.sender, v1WeightToAdd, subYieldRewards, subVaultRewards);

        uint256 weightToRemove;
        uint256 valueToUnstake;

        for (uint256 i = 0; i < _stakes.length; i++) {
            (uint256 _stakeId, uint256 _value) = (_stakes[i].stakeId, _stakes[i].value);
            Stake.Data storage stake = user.stakes[_stakeId];
            // checks if stake is unlocked already
            fnSelector.verifyState(_now256() > stake.lockedUntil, i * 3);
            // stake structure may get deleted, so we save isYield flag to be able to use it
            // we also save stakeValue for gas savings
            (uint120 stakeValue, bool isYield) = (stake.value, stake.isYield);
            fnSelector.verifyState(isYield == _unstakingYield, i * 3 + 1);
            fnSelector.verifyState(stakeValue >= _value, i * 3 + 2);

            // store stake weight
            uint256 previousWeight = stake.weight();
            // value used to save new weight after updates in storage
            uint256 newWeight;

            // update the stake, or delete it if its depleted
            if (stakeValue - _value == 0) {
                // deletes stake struct, no need to save new weight because it stays 0
                delete user.stakes[_stakeId];
            } else {
                stake.value -= uint120(_value);
                // saves new weight to memory
                newWeight = stake.weight();
            }

            weightToRemove += previousWeight - newWeight;
            valueToUnstake += _value;
        }

        user.totalWeight -= uint248(weightToRemove);
        user.subYieldRewards = uint256((user.totalWeight + v1WeightToAdd)).weightToReward(yieldRewardsPerWeight);
        user.subVaultRewards = uint256((user.totalWeight + v1WeightToAdd)).weightToReward(vaultRewardsPerWeight);

        // update global variable
        globalWeight -= weightToRemove;
        // update reserve count
        poolTokenReserve -= valueToUnstake;

        // if the stake was created by the pool itself as a yield reward
        if (_unstakingYield) {
            // mint the yield via the factory
            factory.mintYieldTo(msg.sender, valueToUnstake, false);
        } else {
            // otherwise just return tokens back to holder
            IERC20(poolToken).safeTransfer(msg.sender, valueToUnstake);
        }

        emit LogUnstakeLockedMultiple(msg.sender, valueToUnstake, _unstakingYield);
    }

    /**
     * @dev Used internally, mostly by children implementations, see sync()
     *
     * @dev Updates smart contract state (`yieldRewardsPerWeight`, `lastYieldDistribution`),
     *      updates factory state via `updateILVPerSecond`
     */
    function _sync() internal virtual {
        // gas savings
        IFactory _factory = factory;
        // update ILV per second value in factory if required
        if (_factory.shouldUpdateRatio()) {
            _factory.updateILVPerSecond();
        }

        // check bound conditions and if these are not met -
        // exit silently, without emitting an event
        uint256 endTime = _factory.endTime();
        if (lastYieldDistribution >= endTime) {
            return;
        }
        if (_now256() <= lastYieldDistribution) {
            return;
        }
        // reads total weight staked in v1
        uint256 v1GlobalWeight = ICorePoolV1(corePoolV1).usersLockingWeight();
        // if locking weight is zero - update only `lastYieldDistribution` and exit
        if (globalWeight == 0 && v1GlobalWeight == 0) {
            lastYieldDistribution = uint64(_now256());
            return;
        }

        // to calculate the reward we need to know how many seconds passed, and reward per second
        uint256 currentTimestamp = _now256() > endTime ? endTime : _now256();
        uint256 secondsPassed = currentTimestamp - lastYieldDistribution;
        uint256 ilvPerSecond = _factory.ilvPerSecond();

        // calculate the reward
        uint256 ilvReward = (secondsPassed * ilvPerSecond * weight) / _factory.totalWeight();

        // update rewards per weight and `lastYieldDistribution`
        yieldRewardsPerWeight += ilvReward.rewardPerWeight((globalWeight + v1GlobalWeight));
        lastYieldDistribution = uint64(currentTimestamp);

        // emit an event
        emit LogSync(msg.sender, yieldRewardsPerWeight, lastYieldDistribution);
    }

    /**
     * @dev Used internally, mostly by children implementations
     * @dev Executed before staking, unstaking and claiming the rewards
     * @dev updates user.pendingYield and user.pendingRevDis
     * @dev When timing conditions are not met (executed too frequently, or after factory
     *      end block), function doesn't throw and exits silently
     *
     * @param _staker an address which receives the reward (which has staked some tokens earlier)
     * @param _v1WeightToAdd weight value in v1 protocol to add to calculations
     * @param _subYieldRewards parameter passed down to `_pendingRewards()`
     * @param _subVaultRewards parameter passed down to `_pendingRewards()`
     *
     * @return pendingYield the yield rewards calculated and saved to the user struct
     * @return pendingRevDis the revenue distribution reward calculated and
     *         saved to the user struct
     */
    function _processRewards(
        address _staker,
        uint256 _v1WeightToAdd,
        uint256 _subYieldRewards,
        uint256 _subVaultRewards
    ) internal virtual returns (uint256 pendingYield, uint256 pendingRevDis) {
        // calculate pending yield rewards, this value will be returned
        (pendingYield, pendingRevDis) = _pendingRewards(_staker, _v1WeightToAdd, _subYieldRewards, _subVaultRewards);

        // if pending yield is zero - just return silently
        if (pendingYield == 0 && pendingRevDis == 0) return (0, 0);

        // get link to a user data structure, we will write into it later
        User storage user = users[_staker];

        user.pendingYield += uint128(pendingYield);
        user.pendingRevDis += uint128(pendingRevDis);

        // emit an event
        emit LogProcessRewards(_staker, pendingYield, pendingRevDis);
    }

    /**
     * @dev claims all pendingYield from _staker using ILV or sILV
     *
     * @notice sILV is minted straight away to _staker wallet, ILV is created as
     *         a new stake and locked for 365 days
     *
     * @param _staker user address
     * @param _useSILV whether the user wants to claim ILV or sILV
     */
    function _claimYieldRewards(address _staker, bool _useSILV) internal {
        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);
        // update user state
        _processRewards(_staker, v1WeightToAdd, subYieldRewards, subVaultRewards);

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
            factory.mintYieldTo(_staker, pendingYieldToClaim, true);
        } else if (poolToken == ilv) {
            // calculate pending yield weight,
            // 2e6 is the bonus weight when staking for 1 year
            uint256 stakeWeight = pendingYieldToClaim * Stake.YIELD_STAKE_WEIGHT_MULTIPLIER;

            // if the pool is ILV Pool - create new ILV stake
            // and save it - push it into stakes array
            Stake.Data memory newStake = Stake.Data({
                value: uint120(pendingYieldToClaim),
                lockedFrom: uint64(_now256()),
                lockedUntil: uint64(_now256() + 365 days), // staking yield for 1 year
                isYield: true
            });

            user.stakes.push(newStake);
            user.totalWeight += uint248(stakeWeight);

            // update global variable
            globalWeight += stakeWeight;
            // update reserve count
            poolTokenReserve += pendingYieldToClaim;
        } else {
            // for other pools - stake as pool
            address ilvPool = factory.getPoolAddress(ilv);
            IILVPool(ilvPool).stakeAsPool(_staker, pendingYieldToClaim);
        }

        // subYieldRewards and subVaultRewards needs to be updated on every `_processRewards` call
        user.subYieldRewards = uint256((user.totalWeight + v1WeightToAdd)).weightToReward(yieldRewardsPerWeight);
        user.subVaultRewards = uint256((user.totalWeight + v1WeightToAdd)).weightToReward(vaultRewardsPerWeight);

        // emit an event
        emit LogClaimYieldRewards(_staker, _useSILV, pendingYieldToClaim);
    }

    /**
     * @dev claims all pendingRevDis from _staker using ILV
     * @dev ILV is sent straight away to _staker address
     *
     * @param _staker user address
     */
    function _claimVaultRewards(address _staker) internal {
        // uses v1 weight values for rewards calculations
        (uint256 v1WeightToAdd, uint256 subYieldRewards, uint256 subVaultRewards) = _useV1Weight(msg.sender);
        // update user state
        _processRewards(_staker, v1WeightToAdd, subYieldRewards, subVaultRewards);

        // get link to a user data structure, we will write into it later
        User storage user = users[_staker];

        // check pending yield rewards to claim and save to memory
        uint256 pendingRevDis = uint256(user.pendingRevDis);

        // if pending yield is zero - just return silently
        if (pendingRevDis == 0) return;

        // clears user pending revenue distribution
        user.pendingRevDis = 0;

        // subYieldRewards and subVaultRewards needs to be updated on every `_processRewards` call
        user.subVaultRewards = uint256(user.totalWeight).weightToReward(vaultRewardsPerWeight);

        IERC20(ilv).safeTransfer(_staker, pendingRevDis);

        // emit an event
        emit LogClaimVaultRewards(_staker, pendingRevDis);
    }

    /**
     * @dev Calls CorePoolV1 contract, gets v1 stake ids weight and returns
     * @dev Used by _pendingRewards to calculate yield and revenue distribution
     *      rewards taking v1 weights into account
     *
     * @notice if v1 weights have changed since last call, we use latest v1 weight for
     *         yield and revenue distribution rewards calculations, and recalculate
     *         user sub rewards values in order to have correct rewards estimations
     *
     * @return totalV1Weight uint256 value of v1StakesIds weights
     * @return subYieldRewards uint256 value to use in yield calculations accounting
     *          v1 weights and its possible changes
     * @return subVaultRewards uint256 value to use in revenue distribution
     *          calculations accounting v1 weights and its possible changes
     */
    function _useV1Weight(address _staker)
        internal
        returns (
            uint256 totalV1Weight,
            uint256 subYieldRewards,
            uint256 subVaultRewards
        )
    {
        User storage user = users[_staker];

        uint256 v1StakesLength = user.v1IdsLength;

        uint256 previousTotalV1Weight;

        // checks if user has any migrated stake from v1
        if (v1StakesLength > 0) {
            // loops through v1StakesIds and adds v1 weight with V1_WEIGHT_BONUS
            for (uint256 i = 0; i < v1StakesLength; i++) {
                // saves v1 stake id to memory
                uint256 stakeId = user.v1StakesIds[i];
                (, uint256 _weight, , , ) = ICorePoolV1(corePoolV1).getDeposit(_staker, stakeId);

                uint256 storedWeight = v1StakesMigrated[_staker][stakeId];

                // checks if v1 stake _weight has changed (we ignore if user increased weight)
                if (storedWeight > _weight) {
                    // if deposit has been completely unstaked in v1, set stake id weight to 1
                    // so we can keep track that it has been already migrated.
                    // otherwise just returns _weight
                    v1StakesMigrated[_staker][stakeId] = _weight == 0 ? 1 : _weight;
                }

                previousTotalV1Weight += storedWeight;
                totalV1Weight += _weight <= storedWeight ? _weight : storedWeight;
            }
        }

        uint256 subYieldRewardsStored = user.subYieldRewards;
        uint256 subVaultRewardsStored = user.subVaultRewards;

        if (previousTotalV1Weight != totalV1Weight) {
            uint256 totalWeightStored = user.totalWeight;

            // gets subYieldRewards value to be used for yield calculations
            // during execution
            subYieldRewards = _getSubRewardsValue(
                subYieldRewardsStored,
                totalWeightStored,
                totalV1Weight,
                previousTotalV1Weight
            );
            // gets subVaultRewards value to be used for revenue distribution
            // calculations during execution
            subVaultRewards = _getSubRewardsValue(
                subVaultRewardsStored,
                totalWeightStored,
                totalV1Weight,
                previousTotalV1Weight
            );
        } else {
            subYieldRewards = subYieldRewardsStored;
            subVaultRewards = subVaultRewardsStored;
        }
    }

    /**
     * @dev recalculates subYieldRewards or subVaultRewards using most recent
     *      _totalV1Weight, by getting previous `yieldRewardsPerWeight` used in
     *      last subYieldRewards or subVaultRewards update (through _previousTotalV1Weight)
     *      and returns equivalent value using most recent v1 weight
     *
     * @dev this function is very important in order to keep calculations correct even
     *      after an user unstakes
     *
     * @notice if an user in v1 unstakes before claiming yield in v2, it will be considered
     *         as if the user has been accumulating yield and revenue distributions
     *         with most recent weight since the last user.subYieldRewards and
     *         user.subVaultRewards update
     * @notice v1 stake token amount of a given stakeId can never increase in v1 contracts.
     *         this way we are safe of attacks by adding more tokens in v1 and having
     *         a higher accumulation of yield and revenue distributions
     *
     */
    function _getSubRewardsValue(
        uint256 _subRewardsStored,
        uint256 _totalWeightStored,
        uint256 _totalV1Weight,
        uint256 _previousTotalV1Weight
    ) internal pure returns (uint256 subRewards) {
        subRewards =
            (((_subRewardsStored * Stake.REWARD_PER_WEIGHT_MULTIPLIER) /
                (_totalWeightStored + _previousTotalV1Weight)) * (_totalWeightStored + _totalV1Weight)) /
            Stake.REWARD_PER_WEIGHT_MULTIPLIER;
    }

    /// @dev checks if pool is paused
    function _requireNotPaused() internal view {
        require(!paused());
    }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address) internal override {
        // checks caller is factory.owner()
        _requireIsFactoryController();
    }
}
