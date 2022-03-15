// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { Timestamp } from "./base/Timestamp.sol";
import { FactoryControlled } from "./base/FactoryControlled.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ErrorHandler } from "./libraries/ErrorHandler.sol";
import { SafeCast } from "./libraries/SafeCast.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { IILVPool } from "./interfaces/IILVPool.sol";
import { IFactory } from "./interfaces/IFactory.sol";

/**
 * @title Flash Pool.
 *
 * @dev A Flash Pool contract is a temporary pool with an arbitrary ERC20 token
 *     from a new Illuvium DAO partner voted by the council.
 * @dev Holders of this ERC20 token (which is stored at `poolToken`) are able to
 *      stake it and receive ILV yield rewards, which can be claimed and vested
 *      in the ILV pool.
 * @dev Operations in Flash Pools are cheaper compared to Core Pools, since we
 *      don't lock tokens and we don't need to deal with mappings and arrays
 *      as much as we do in the ILV and Sushi LP pools.
 */
contract FlashPool is
    Initializable,
    UUPSUpgradeable,
    FactoryControlled,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    Timestamp
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using ErrorHandler for bytes4;
    using SafeCast for uint256;

    struct User {
        /// @dev Total staked amount
        uint128 balance;
        /// @dev pending yield rewards to be claimed
        uint128 pendingYield;
        /// @dev Auxiliary variable for yield calculation
        uint256 subYieldRewards;
    }

    /// @dev Token holder storage, maps token holder address to their data record.
    mapping(address => User) public users;

    /// @dev Link to sILV ERC20 Token instance.
    address private _silv;

    /// @dev Link to ILV ERC20 Token instance.
    address private _ilv;

    /// @dev Link to the pool token instance, for example ILV or ILV/ETH pair.
    address public poolToken;

    /// @dev Flash pool ending timestamp.
    uint64 public endTime;

    /// @dev Pool weight, 200 for ILV pool or 800 for ILV/ETH.
    uint32 public weight;

    /// @dev Timestamp of the last yield distribution event.
    uint64 public lastYieldDistribution;

    /// @dev Used to calculate yield rewards.
    uint256 public yieldRewardsPerToken;

    /// @dev Rewards per token are stored multiplied by 1e18 as uint.
    uint256 internal constant REWARD_PER_TOKEN_MULTIPLIER = 1e18;

    /// @dev Flag indicating pool type, false means "core pool".
    bool public constant isFlashPool = true;

    /**
     * @dev Fired in stake().
     * @param from token holder address, the tokens will be returned to that address
     * @param value value of tokens staked
     */
    event LogStake(address indexed from, uint256 value);

    /**
     * @dev Fired in unstake().
     *
     * @param to address receiving the tokens (user)
     * @param value number of tokens unstaked
     */
    event LogUnstake(address indexed to, uint256 value);

    /**
     * @dev Fired in _sync(), sync() and dependent functions (stake, unstake, etc.).
     *
     * @param by an address which performed an operation
     * @param yieldRewardsPerToken updated yield rewards per token value
     * @param lastYieldDistribution usually, current timestamp
     */
    event LogSync(address indexed by, uint256 yieldRewardsPerToken, uint64 lastYieldDistribution);

    /**
     * @dev Fired in _claimYieldRewards().
     *
     * @param from an address which received the yield
     * @param sILV flag indicating if reward was paid (minted) in sILV
     * @param value value of yield paid
     */
    event LogClaimYieldRewards(address indexed from, bool sILV, uint256 value);

    /**
     * @dev Fired in _processRewards().
     *
     * @param from an address which received the yield
     * @param value value of yield paid
     */
    event LogProcessRewards(address indexed from, uint256 value);

    /**
     * @dev Fired in setWeight().
     *
     * @param by an address which performed an operation, always a factory
     * @param fromVal old pool weight value
     * @param toVal new pool weight value
     */
    event LogSetWeight(address indexed by, uint32 fromVal, uint32 toVal);

    /**
     * @dev fired in moveFundsFromWallet().
     *
     * @param from user asking migration
     * @param to new user address
     * @param previousBalance balance of `from` before moving to a new address
     * @param newBalance balance of `to` after moving to a new address
     * @param previousYield pending yield of `from` before moving to a new address
     * @param newYield pending yield of `to` after moving to a new address
     */
    event LogMoveFundsFromWallet(
        address indexed from,
        address indexed to,
        uint248 previousBalance,
        uint248 newBalance,
        uint128 previousYield,
        uint128 newYield
    );

    /// @dev used for functions that require syncing contract state before execution
    modifier updatePool() {
        _sync();
        _;
    }

    /**
     * @dev Initializes a new flash pool.
     *
     * @param ilv_ ILV ERC20 Token address
     * @param silv_ sILV ERC20 Token address
     * @param _poolToken token the pool operates on, for example ILV or ILV/ETH pair
     * @param factory_ PoolFactory contract address
     * @param _initTime initial timestamp used to calculate the rewards
     *      note: _initTime can be set to the future effectively meaning _sync() calls will do nothing
     * @param _weight number representing a weight of the pool, actual weight fraction
     *      is calculated as that number divided by the total pools weight and doesn't exceed one
     */
    function initialize(
        address ilv_,
        address silv_,
        address _poolToken,
        address factory_,
        uint64 _initTime,
        uint64 _endTime,
        uint32 _weight
    ) external initializer {
        bytes4 fnSelector = this.initialize.selector;
        fnSelector.verifyNonZeroInput(uint160(_poolToken), 2);
        fnSelector.verifyNonZeroInput(_initTime, 4);
        fnSelector.verifyNonZeroInput(_weight, 6);
        fnSelector.verifyInput(_endTime > _now256(), 5);

        __FactoryControlled_init(factory_);
        __ReentrancyGuard_init();
        __Pausable_init();

        // save the inputs into internal state variables
        _ilv = ilv_;
        _silv = silv_;
        poolToken = _poolToken;
        weight = _weight;

        // init the dependent internal state variables
        lastYieldDistribution = _initTime;
        endTime = _endTime;
    }

    /**
     * @notice Calculates current yield rewards value available for address specified
     *
     * @dev see _pendingYieldRewards() for further details
     *
     * @param _staker an address to calculate yield rewards value for
     * @return pending calculated yield reward value for the given address
     */
    function pendingYieldRewards(address _staker) external view virtual returns (uint256 pending) {
        // `newYieldRewardsPerToken` will store stored or recalculated value for `yieldRewardsPerToken`
        uint256 newYieldRewardsPerToken;

        uint256 totalStaked = IERC20Upgradeable(poolToken).balanceOf(address(this));

        // if smart contract state was not updated recently, `yieldRewardsPerToken` value
        // is outdated and we need to recalculate it in order to calculate pending rewards correctly
        if (_now256() > lastYieldDistribution && totalStaked != 0) {
            uint256 _endTime = _factory.endTime();
            uint256 multiplier = _now256() > _endTime
                ? _endTime - lastYieldDistribution
                : _now256() - lastYieldDistribution;
            uint256 ilvRewards = (multiplier * weight * _factory.ilvPerSecond()) / _factory.totalWeight();

            // recalculated value for `yieldRewardsPerToken`
            newYieldRewardsPerToken = _rewardPerToken(ilvRewards, totalStaked) + yieldRewardsPerToken;
        } else {
            // if smart contract state is up to date, we don't recalculate
            newYieldRewardsPerToken = yieldRewardsPerToken;
        }

        // based on the rewards per token value, calculate pending rewards;
        User memory user = users[_staker];
        pending = (_tokensToReward(user.balance, newYieldRewardsPerToken) - user.subYieldRewards) + user.pendingYield;
    }

    /**
     * @notice Returns total staked token balance for the given address
     *
     * @param _user an address to query balance for
     * @return balance total staked token balance
     */
    function balanceOf(address _user) external view virtual returns (uint256 balance) {
        // return entire user balance
        balance = users[_user].balance;
    }

    /**
     * @notice Checks if flash pool has ended. Flash pool is considered "disabled"
     *      once time reaches its "end time".
     *
     * @return true if pool is disabled, false otherwise
     */
    function isPoolDisabled() public view virtual returns (bool) {
        // verify the pool expiration condition and return the result
        return _now256() > endTime;
    }

    /**
     * @dev Set paused/unpaused state in the pool contract.
     *
     * @param _shouldPause whether the contract should be paused/unpausd
     */
    function pause(bool _shouldPause) external {
        // checks if caller is authorized to pause
        _requireIsFactoryController();
        // checks bool input and pause/unpause the contract depending on
        // msg.sender's request
        if (_shouldPause) {
            _pause();
        } else {
            _unpause();
        }
    }

    /**
     * @dev stakes poolTokens without lock
     *
     *
     * @param _value number of tokens to stake
     */
    function stake(uint256 _value) external virtual updatePool whenNotPaused nonReentrant {
        bytes4 fnSelector = this.stake.selector;
        // validates input
        fnSelector.verifyNonZeroInput(_value, 0);

        // get a link to user data struct, we will write to it later
        User storage user = users[msg.sender];
        // process current pending rewards if any
        if (user.balance > 0) {
            _processRewards(msg.sender);
        }

        // in most of the cases added value `addedValue` is simply `_value`
        // however for deflationary tokens this can be different

        // gas savings
        address _poolToken = poolToken;
        // read the current balance
        uint256 previousBalance = IERC20Upgradeable(_poolToken).balanceOf(address(this));
        // transfer `_value`; note: some types of tokens may get burnt here
        IERC20Upgradeable(_poolToken).safeTransferFrom(address(msg.sender), address(this), _value);
        // read new balance, usually this is just the difference `previousBalance - _value`
        uint256 newBalance = IERC20Upgradeable(_poolToken).balanceOf(address(this));
        // calculate real value taking into account deflation
        uint256 addedValue = newBalance - previousBalance;

        // makes sure addedValue is valid
        assert(addedValue > 0);

        // update user record
        user.balance += (addedValue).toUint128();
        user.subYieldRewards = _tokensToReward(user.balance, yieldRewardsPerToken);

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
    function moveFundsFromWallet(address _to) external virtual updatePool whenNotPaused {
        bytes4 fnSelector = this.moveFundsFromWallet.selector;
        fnSelector.verifyNonZeroInput(uint160(_to), 0);

        User storage newUser = users[_to];
        fnSelector.verifyState(newUser.balance == 0 && newUser.pendingYield == 0 && newUser.subYieldRewards == 0, 1);

        User storage previousUser = users[msg.sender];
        uint128 balance = previousUser.balance;
        uint128 pendingYield = previousUser.pendingYield;
        uint256 subYieldRewards = previousUser.subYieldRewards;
        previousUser.balance = 0;
        previousUser.pendingYield = 0;
        previousUser.subYieldRewards = 0;

        newUser.balance = balance;
        newUser.pendingYield = pendingYield;
        newUser.subYieldRewards = subYieldRewards;

        emit LogMoveFundsFromWallet(msg.sender, _to, balance, newUser.balance, pendingYield, newUser.pendingYield);
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
    function sync() external virtual whenNotPaused {
        // delegate call to an internal function
        _sync();
    }

    /**
     * @dev calls internal _claimYieldRewards() passing `msg.sender` as `_staker`
     *
     * @notice pool state is updated before calling the internal function
     */
    function claimYieldRewards(bool _useSILV) external virtual updatePool whenNotPaused {
        _claimYieldRewards(msg.sender, _useSILV);
    }

    /**
     * @notice this function can be called only by ILV core pool
     *
     * @dev uses ILV pool as a router by receiving the _staker address and executing
     *      the internal _claimYieldRewards()
     * @dev its usage allows claiming multiple pool contracts in one transaction
     *
     * @param _staker user address
     * @param _useSILV whether it should claim pendingYield as ILV or sILV
     */
    function claimYieldRewardsFromRouter(address _staker, bool _useSILV) external virtual updatePool whenNotPaused {
        bytes4 fnSelector = this.claimYieldRewardsFromRouter.selector;
        bool poolIsValid = address(IFactory(_factory).pools(_ilv)) == msg.sender;
        fnSelector.verifyState(poolIsValid, 0);

        _claimYieldRewards(_staker, _useSILV);
    }

    /**
     * @dev Executed by the factory to modify pool weight; the factory is expected
     *      to keep track of the total pools weight when updating
     *
     * @dev Set weight to zero to disable the pool
     *
     * @param _weight new weight to set for the pool
     */
    function setWeight(uint32 _weight) external virtual updatePool {
        bytes4 fnSelector = this.setWeight.selector;
        // verify function is executed by the factory
        fnSelector.verifyState(msg.sender == address(_factory), 0);

        // set the new weight value
        weight = _weight;

        // emit an event logging old and new weight values
        emit LogSetWeight(msg.sender, weight, _weight);
    }

    /**
     * @dev Updates flash pool ending timestamp.
     *
     * @param _newEndTime new flash pool end time
     */
    function setEndTime(uint64 _newEndTime) external virtual {
        bytes4 fnSelector = this.setEndTime.selector;
        fnSelector.verifyInput(_newEndTime > _now256(), 0);
        _requireIsFactoryController();

        endTime = _newEndTime;
    }

    /**
     * @dev Similar to public pendingYieldRewards, but performs calculations based on
     *      current smart contract state only, not taking into account any additional
     *      time which might have passed.
     *
     *
     * @param _staker an address to calculate yield rewards value for
     * @return pending calculated yield reward value for the given address
     */
    function _pendingYieldRewards(address _staker) internal view virtual returns (uint256 pending) {
        // links to _staker user struct in storage
        User storage user = users[_staker];

        pending = _tokensToReward(user.balance, yieldRewardsPerToken) - user.subYieldRewards;
    }

    function unstake(uint256 _value) external virtual updatePool nonReentrant {
        bytes4 fnSelector = this.unstake.selector;
        // verify a value is set
        fnSelector.verifyNonZeroInput(_value, 0);
        // get a link to user data struct, we will write to it later
        User storage user = users[msg.sender];
        // verify available balance
        fnSelector.verifyState(user.balance >= _value, 1);
        // and process current pending rewards if any
        _processRewards(msg.sender);

        // updates user data in storage
        user.balance -= (_value).toUint128();
        // subYieldRewards needs to be updated on every `_processRewards` call
        user.subYieldRewards = _tokensToReward(user.balance, yieldRewardsPerToken);

        // finally, transfers `_value` poolTokens
        IERC20Upgradeable(poolToken).safeTransfer(msg.sender, _value);

        // emit an event
        emit LogUnstake(msg.sender, _value);
    }

    /**
     * @dev Used internally, mostly by children implementations, see sync()
     *
     * @dev Updates smart contract state (`yieldRewardsPerToken`, `lastYieldDistribution`),
     *      updates factory state via `updateILVPerSecond`
     */
    function _sync() internal virtual {
        // gas savings
        IFactory factory_ = _factory;
        // update ILV per second value in factory if required
        if (factory_.shouldUpdateRatio()) {
            factory_.updateILVPerSecond();
        }
        // gas savings
        uint256 _endTime = endTime;
        if (lastYieldDistribution >= _endTime) {
            return;
        }
        if (_now256() <= lastYieldDistribution) {
            return;
        }
        uint256 totalStaked = IERC20Upgradeable(poolToken).balanceOf(address(this));
        // if pool token balance is zero - update only `lastYieldDistribution` and exit
        if (totalStaked == 0) {
            lastYieldDistribution = (_now256()).toUint64();
            return;
        }

        // to calculate the reward we need to know how many seconds passed, and reward per second
        uint256 currentTimestamp = _now256() > _endTime ? _endTime : _now256();
        uint256 secondsPassed = currentTimestamp - lastYieldDistribution;
        uint256 ilvPerSecond = factory_.ilvPerSecond();

        // calculate the reward
        uint256 ilvReward = (secondsPassed * ilvPerSecond * weight) / factory_.totalWeight();

        // update rewards per weight and `lastYieldDistribution`
        yieldRewardsPerToken += _rewardPerToken(ilvReward, totalStaked);
        lastYieldDistribution = (currentTimestamp).toUint64();

        // if weight is not yet set and pool has finished
        if (weight != 0 && _now256() >= _endTime) {
            // set the pool weight (sets both factory and local values)
            factory_.changePoolWeight(address(this), 0);
        }

        // emit an event
        emit LogSync(msg.sender, yieldRewardsPerToken, lastYieldDistribution);
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

        user.pendingYield += (pendingYield).toUint128();

        // emit an event
        emit LogProcessRewards(_staker, pendingYield);
    }

    /**
     * @dev claims all pendingYield from _staker using ILV or sILV
     *
     * @notice sILV is minted straight away to _staker wallet, ILV is created as
     *         a new stake and locked for Stake.MAX_STAKE_PERIOD
     *
     * @param _staker user address
     * @param _useSILV whether the user wants to claim ILV or sILV
     */
    function _claimYieldRewards(address _staker, bool _useSILV) internal virtual {
        // get link to a user data structure, we will write into it later
        User storage user = users[_staker];
        if (user.balance > 0) {
            // update user state
            _processRewards(_staker);
        }

        // check pending yield rewards to claim and save to memory
        uint256 pendingYieldToClaim = uint256(user.pendingYield);

        // if pending yield is zero - just return silently
        if (pendingYieldToClaim == 0) return;

        // clears user pending yield
        user.pendingYield = 0;

        // if sILV is requested
        if (_useSILV) {
            // - mint sILV
            _factory.mintYieldTo(_staker, pendingYieldToClaim, true);
        } else {
            // for other pools - stake as pool
            address ilvPool = _factory.getPoolAddress(_ilv);
            IILVPool(ilvPool).stakeAsPool(_staker, pendingYieldToClaim);
        }

        // subYieldRewards needs to be updated on every `_processRewards` call
        user.subYieldRewards = _tokensToReward(user.balance, yieldRewardsPerToken);

        // emit an event
        emit LogClaimYieldRewards(_staker, _useSILV, pendingYieldToClaim);
    }

    /**
     * @dev Converts number of tokens staked to ILV reward value, applying the
     *      10^12 division on number of tokens (`_value`)
     *
     * @param _value stake value
     * @param __rewardPerToken ILV reward per token
     * @return reward value normalized to 10^12
     */
    function _tokensToReward(uint256 _value, uint256 __rewardPerToken) internal pure virtual returns (uint256) {
        // apply the formula and return
        return (_value * __rewardPerToken) / REWARD_PER_TOKEN_MULTIPLIER;
    }

    /**
     * @dev Converts reward ILV value to reward/tokens
     *
     * @param _reward yield reward
     * @param _totalStaked total value staked in the pool
     * @return reward per token value
     */
    function _rewardPerToken(uint256 _reward, uint256 _totalStaked) internal pure virtual returns (uint256) {
        // apply the reverse formula and return
        return (_reward * REWARD_PER_TOKEN_MULTIPLIER) / _totalStaked;
    }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address) internal view virtual override {
        // checks caller is _factory.owner()
        _requireIsFactoryController();
    }

    /**
     * @dev Empty reserved space in storage. The size of the __gap array is calculated so that
     *      the amount of storage used by a contract always adds up to the 50.
     *      See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[44] private __gap;
}
