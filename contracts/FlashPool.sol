// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { Timestamp } from "./base/Timestamp.sol";
import { FactoryControlled } from "./base/FactoryControlled.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IlluviumAware } from "./libraries/IlluviumAware.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IILVPool } from "./interfaces/IILVPool.sol";
import { IFactory } from "./interfaces/IFactory.sol";

import "hardhat/console.sol";

contract FlashPool is UUPSUpgradeable, FactoryControlled, ReentrancyGuardUpgradeable, PausableUpgradeable, Timestamp {
    using SafeERC20 for IERC20;

    struct User {
        /// @dev Total staked amount
        uint128 balance;
        /// @dev pending yield rewards to be claimed
        uint128 pendingYield;
        /// @dev Auxiliary variable for yield calculation
        uint256 subYieldRewards;
    }

    /// @dev Token holder storage, maps token holder address to their data record
    mapping(address => User) public override users;

    /// @dev Link to sILV ERC20 Token instance
    address public override silv;

    /// @dev Link to ILV ERC20 Token instance
    address public ilv;

    /// @dev Link to the pool token instance, for example ILV or ILV/ETH pair
    address public override poolToken;

    /// @dev Pool weight, 200 for ILV pool or 800 for ILV/ETH
    uint32 public override weight;

    /// @dev Timestamp of the last yield distribution event
    uint64 public override lastYieldDistribution;

    /// @dev Used to calculate yield rewards
    /// @dev This value is different from "reward per token" used in locked pool
    /// @dev Note: stakes are different in duration and "weight" reflects that
    uint256 public override yieldRewardsPerToken;

    /// @dev Flag indicating pool type, false means "core pool"
    bool public constant override isFlashPool = true;

    /**
     * @dev Fired in stake()
     * @param from token holder address, the tokens will be returned to that address
     * @param value value of tokens staked
     */
    event LogStake(address indexed from, uint256 value);

    /**
     * @dev Fired in unstake()
     *
     * @param to address receiving the tokens (user)
     * @param value number of tokens unstaked
     */
    event LogUnstake(address indexed to, uint256 value);

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
     * @param _factory PoolFactory contract address
     * @param _initTime initial timestamp used to calculate the rewards
     *      note: _initTime can be set to the future effectively meaning _sync() calls will do nothing
     * @param _weight number representing a weight of the pool, actual weight fraction
     *      is calculated as that number divided by the total pools weight and doesn't exceed one
     */
    function __FlashPool_init(
        address _ilv,
        address _silv,
        address _poolToken,
        address _factory,
        uint64 _initTime,
        uint32 _weight
    ) internal initializer {
        require(_poolToken != address(0), "pool token address not set");
        require(_initTime > 0, "init time not set");
        require(_weight > 0, "pool weight not set");

        __FactoryControlled_init(_factory);

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
     * @return pending calculated yield reward value for the given address
     */
    function pendingYieldRewards(address _staker) external view override returns (uint256 pending) {
        require(_staker != address(0), "invalid _staker");
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
        (uint256 v1StakesLength, uint256 userWeight) = (uint256(user.v1IdsLength), uint256(user.totalWeight));
        // value will be used to add to final weight calculations before
        // calculating rewards
        uint256 weightToAdd;

        // checks if user has any migrated stake from v1
        if (v1StakesLength > 0) {
            // loops through v1StakesIds and adds v1 weight with V1_WEIGHT_BONUS
            for (uint256 i = 0; i < v1StakesLength; i++) {
                (, uint256 _weight, , , ) = ICorePoolV1(corePoolV1).getDeposit(_staker, user.v1StakesIds[i]);

                weightToAdd += _toV2Weight(_weight);
            }
        }

        pending = _weightToReward(userWeight, newYieldRewardsPerWeight) - user.subYieldRewards;
    }

    /**
     * @notice Returns total staked token balance for the given address
     *
     * @param _user an address to query balance for
     * @return balance total staked token balance
     */
    function balanceOf(address _user) external view override returns (uint256 balance) {
        balance = users[_user].balance;
    }

    /**
     * @dev stakes poolTokens without lock
     *
     *
     * @param _value number of tokens to stake
     */
    function stake(uint256 _value) external updatePool whenNotPaused nonReentrant {
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

        // makes sure addedValue is valid
        assert(addedValue > 0);

        // update user record
        user.balance += uint128(addedValue);
        user.subYieldRewards = _weightToReward(user.totalWeight, yieldRewardsPerWeight);

        // emit an event
        emit LogStake(msg.sender, _value);
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
        require(_to != address(0), "invalid _to");
        User storage newUser = users[_to];
        require(
            newUser.totalWeight == 0 && newUser.v1IdsLength == 0 && newUser.pendingYield == 0,
            "invalid user, already exists"
        );

        User storage previousUser = users[msg.sender];
        uint128 balance = previousUser.balance;
        uint128 pendingYield = previousUser.pendingYield;
        uint248 totalWeight = previousUser.totalWeight;
        uint256 subYieldRewards = previousUser.subYieldRewards;
        uint256 subVaultRewards = previousUser.subVaultRewards;
        previousUser.balance = 0;
        previousUser.pendingYield = 0;
        previousUser.totalWeight = 0;
        previousUser.subYieldRewards = 0;
        previousUser.subVaultRewards = 0;
        for (uint256 i = 0; i < previousUser.stakes.length; i++) {
            delete previousUser.stakes[i];
        }
        newUser.balance = balance;
        newUser.pendingYield = pendingYield;
        newUser.totalWeight = totalWeight;
        newUser.subYieldRewards = subYieldRewards;
        newUser.subVaultRewards = subVaultRewards;

        emit LogMigrateUser(msg.sender, _to);
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
     * @dev calls internal _claimRewards() passing `msg.sender` as `_staker`
     *
     * @notice pool state is updated before calling the internal function
     */
    function claimRewards(bool _useSILV) external updatePool whenNotPaused {
        _claimRewards(msg.sender, _useSILV);
    }

    /**
     * @notice this function can be called only by ILV core pool
     *
     * @dev uses ILV pool as a router by receiving the _staker address and executing
     *      the internal _claimRewards()
     * @dev its usage allows claiming multiple pool contracts in one transaction
     *
     * @param _staker user address
     * @param _useSILV whether it should claim pendingYield as ILV or sILV
     */
    function claimRewardsFromRouter(address _staker, bool _useSILV) external virtual override updatePool whenNotPaused {
        bool poolIsValid = address(IFactory(factory).pools(ilv)) == msg.sender;
        require(poolIsValid, "invalid caller");

        _claimRewards(_staker, _useSILV);
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
        (uint256 v1StakesLength, uint256 userWeight) = (uint256(user.v1IdsLength), uint256(user.totalWeight));
        // value will be used to add to final weight calculations before
        // calculating rewards
        uint256 weightToAdd;

        // checks if user has any migrated stake from v1
        if (v1StakesLength > 0) {
            // loops through v1StakesIds and adds v1 weight with V1_WEIGHT_BONUS
            for (uint256 i = 0; i < v1StakesLength; i++) {
                (, uint256 _weight, , , ) = ICorePoolV1(corePoolV1).getDeposit(_staker, user.v1StakesIds[i]);

                weightToAdd += _toV2Weight(_weight);
            }
        }

        pending = _weightToReward((userWeight + weightToAdd), yieldRewardsPerWeight);
    }

    function unstake(uint256 _value) external updatePool nonReentrant {
        // verify a value is set
        require(_value > 0, "zero value");
        // get a link to user data struct, we will write to it later
        User storage user = users[msg.sender];
        // verify available balance
        require(user.balance >= _value, "value exceeds user balance");
        // and process current pending rewards if any
        _processRewards(msg.sender);

        // updates user data in storage
        user.balance -= uint128(_value);
        user.totalWeight -= uint248(_value * Stake.WEIGHT_MULTIPLIER);
        // update reserve count
        poolTokenReserve -= _value;

        // finally, transfers `_value` poolTokens
        IERC20(poolToken).safeTransfer(msg.sender, _value);

        // emit an event
        emit LogUnstake(msg.sender, _value);
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
     *      end time), function doesn't throw and exits silently
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

    /**
     * @dev claims all pendingYield from _staker using ILV or sILV
     *
     * @notice sILV is minted straight away to _staker wallet, ILV is created as
     *         a new stake and locked for 365 days
     *
     * @param _staker user address
     * @param _useSILV whether the user wants to claim ILV or sILV
     */
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
            factory.mintYieldTo(msg.sender, pendingYieldToClaim, true);
        } else if (poolToken == ilv) {
            // calculate pending yield weight,
            // 2e6 is the bonus weight when staking for 1 year
            uint256 stakeWeight = pendingYieldToClaim * YEAR_STAKE_WEIGHT_MULTIPLIER;

            // if the pool is ILV Pool - create new ILV stake
            // and save it - push it into stakes array
            Stake.Data memory newStake = Stake.Data({
                value: uint120(pendingYieldToClaim),
                lockedFrom: uint64(_now256()),
                lockedUntil: uint64(_now256() + 730 days), // staking yield for 1 year
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
    function _weightToReward(uint256 _weight, uint256 _rewardPerWeight) internal pure returns (uint256) {
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
    function _rewardPerWeight(uint256 _reward, uint256 _globalWeight) internal pure returns (uint256) {
        // apply the reverse formula and return
        return (_reward * REWARD_PER_WEIGHT_MULTIPLIER) / _globalWeight;
    }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address) internal override onlyFactoryController {}
}
