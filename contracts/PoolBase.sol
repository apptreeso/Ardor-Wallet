// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "../interfaces/IFactory.sol";

import "./VaultRecipient.sol";
import "hardhat/console.sol";

// TODO: redefine user struct supporting 721
abstract contract PoolBase is ERC721, ReentrancyGuard, Pausable, Ownable {
    /// @dev Data structure representing token holder using a pool
    struct User {
        // @dev Total staked amount
        uint256 tokenAmount;
        // @dev Total weight
        uint256 totalWeight;
        // @dev Auxiliary variable for yield calculation
        uint256 subYieldRewards;
        // @dev Auxiliary variable for vault rewards calculation
        uint256 subVaultRewards;
    }

    /// @dev Token holder storage, maps token holder address to their data record
    mapping(address => User) public users;

    /// @dev Link to sILV ERC20 Token EscrowedIlluviumERC20 instance
    address public immutable override silv;

    /// @dev Link to the pool factory IlluviumPoolFactory instance
    IlluviumPoolFactory public immutable factory;

    /// @dev Link to the pool token instance, for example ILV or ILV/ETH pair
    address public immutable override poolToken;

    /// @dev Pool weight, 100 for ILV pool or 900 for ILV/ETH
    uint32 public override weight;

    /// @dev Block number of the last yield distribution event
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
     * @param lastYieldDistribution usually, current block number
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
     * @dev Overridden in sub-contracts to construct the pool
     *
     * @param _ilv ILV ERC20 Token IlluviumERC20 address
     * @param _silv sILV ERC20 Token EscrowedIlluviumERC20 address
     * @param _factory Pool factory IlluviumPoolFactory instance/address
     * @param _poolToken token the pool operates on, for example ILV or ILV/ETH pair
     * @param _initBlock initial block used to calculate the rewards
     *      note: _initBlock can be set to the future effectively meaning _sync() calls will do nothing
     * @param _weight number representing a weight of the pool, actual weight fraction
     *      is calculated as that number divided by the total pools weight and doesn't exceed one
     */
    constructor(
        address _ilv,
        address _silv,
        IFactory _factory,
        address _poolToken,
        uint64 _initBlock,
        uint32 _weight
    ) IlluviumAware(_ilv) {
        // verify the inputs are set
        require(_silv != address(0), "sILV address not set");
        require(address(_factory) != address(0), "ILV Pool fct address not set");
        require(_poolToken != address(0), "pool token address not set");
        require(_initBlock > 0, "init block not set");
        require(_weight > 0, "pool weight not set");

        // verify sILV instance supplied
        require(
            EscrowedIlluviumERC20(_silv).TOKEN_UID() ==
                0xac3051b8d4f50966afb632468a4f61483ae6a953b74e387a01ef94316d6b7d62,
            "unexpected sILV TOKEN_UID"
        );
        // verify IlluviumPoolFactory instance supplied
        require(
            _factory.FACTORY_UID() == 0xc5cfd88c6e4d7e5c8a03c255f03af23c0918d8e82cac196f57466af3fd4a5ec7,
            "unexpected FACTORY_UID"
        );

        // save the inputs into internal state variables
        silv = _silv;
        factory = _factory;
        poolToken = _poolToken;
        weight = _weight;

        // init the dependent internal state variables
        lastYieldDistribution = _initBlock;
    }
}
