// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Timestamp } from "./base/Timestamp.sol";
// import { CorePool } from "./CorePool.sol";
import { IlluviumAware } from "./libraries/IlluviumAware.sol";
import { IPoolBase } from "./interfaces/IPoolBase.sol";
import { ICorePool } from "./interfaces/ICorePool.sol";
import { IFactory } from "./interfaces/IFactory.sol";

import "hardhat/console.sol";

/**
 * @title Pool Factory V2
 *
 * @notice ILV Pool Factory manages Illuvium Yield farming pools, provides a single
 *      public interface to access the pools, provides an interface for the pools
 *      to mint yield rewards, access pool-related info, update weights, etc.
 *
 * @notice The factory is authorized (via its owner) to register new pools, change weights
 *      of the existing pools, removing the pools (by changing their weights to zero)
 *
 * @dev The factory requires ROLE_TOKEN_CREATOR permission on the ILV token to mint yield
 *      (see `mintYieldTo` function)
 *
 */
contract PoolFactory is UUPSUpgradeable, OwnableUpgradeable, IFactory, Timestamp {
    /// @inheritdoc IFactory
    /// @dev TODO: set correct UID
    uint256 public constant override FACTORY_UID = 0xc5cfd88c6e4d7e5c8a03c255f03af23c0918d8e82cac196f57466af3fd4a5ec7;

    /// @inheritdoc IFactory
    uint192 public override ilvPerSecond;

    /// @inheritdoc IFactory
    uint32 public override totalWeight;

    /// @inheritdoc IFactory
    uint32 public override secondsPerUpdate;

    /// @inheritdoc IFactory
    uint32 public override endTime;

    /// @inheritdoc IFactory
    uint32 public override lastRatioUpdate;

    /// @inheritdoc IFactory
    address public override ilv;

    /// @inheritdoc IFactory
    address public override silv;

    /// @inheritdoc IFactory
    mapping(address => address) public override pools;

    /// @inheritdoc IFactory
    mapping(address => bool) public override poolExists;

    /**
     * @dev Initializes a factory instance
     *
     * @param _ilv ILV ERC20 token address
     * @param _silv sILV ERC20 token address
     * @param _ilvPerSecond initial ILV/second value for rewards
     * @param _secondsPerUpdate how frequently the rewards gets updated (decreased by 3%), seconds
     * @param _initTime timestamp to measure _secondsPerUpdate from
     * @param _endTime timestamp number when farming stops and rewards cannot be updated anymore
     */

    function initialize(
        address _ilv,
        address _silv,
        uint192 _ilvPerSecond,
        uint32 _secondsPerUpdate,
        uint32 _initTime,
        uint32 _endTime
    ) public payable initializer {
        // verify the inputs are set
        require(_silv != address(0), "sILV address not set");
        require(_ilvPerSecond > 0, "ILV/second not set");
        require(_secondsPerUpdate > 0, "seconds/update not set");
        require(_initTime > 0, "init seconds not set");
        require(_endTime > _initTime, "invalid end time: must be greater than init time");

        // verify ilv and silv instanes
        IlluviumAware.verifyILV(_ilv);
        IlluviumAware.verifySILV(_silv);

        // save the inputs into internal state variables
        ilv = _ilv;
        silv = _silv;
        ilvPerSecond = _ilvPerSecond;
        secondsPerUpdate = _secondsPerUpdate;
        lastRatioUpdate = _initTime;
        endTime = _endTime;
    }

    /// @inheritdoc IFactory
    function getPoolAddress(address poolToken) external view override returns (address) {
        // read the mapping and return
        return address(pools[poolToken]);
    }

    /// @inheritdoc IFactory
    function getPoolData(address _poolToken) public view override returns (PoolData memory) {
        // get the pool address from the mapping
        IPoolBase pool = IPoolBase(pools[_poolToken]);

        // throw if there is no pool registered for the token specified
        require(address(pool) != address(0), "pool not found");

        // read pool information from the pool smart contract
        // via the pool interface (IPoolBase)
        address poolToken = pool.poolToken();
        bool isFlashPool = pool.isFlashPool();
        uint32 weight = pool.weight();

        // create the in-memory structure and return it
        return PoolData({ poolToken: poolToken, poolAddress: address(pool), weight: weight, isFlashPool: isFlashPool });
    }

    /// @inheritdoc IFactory
    function shouldUpdateRatio() public view override returns (bool) {
        // if yield farming period has ended
        if (_now256() > endTime) {
            // ILV/second reward cannot be updated anymore
            return false;
        }

        // check if seconds/update have passed since last update
        return _now256() >= lastRatioUpdate + secondsPerUpdate;
    }

    /// @inheritdoc IFactory
    // function createPool(
    //     address poolToken,
    //     uint64 initTime,
    //     uint32 weight
    // ) external virtual override onlyOwner {
    //     // create/deploy new core pool instance
    //     ICorePool pool = new CorePool(ilv, silv, this, poolToken, initTime, weight);

    //     // register it within a factory
    //     registerPool(address(pool));
    // }

    /// @inheritdoc IFactory
    function registerPool(address pool) public override onlyOwner {
        // read pool information from the pool smart contract
        // via the pool interface (IPoolBase)
        address poolToken = IPoolBase(pool).poolToken();
        bool isFlashPool = IPoolBase(pool).isFlashPool();
        uint32 weight = IPoolBase(pool).weight();

        // create pool structure, register it within the factory
        pools[poolToken] = pool;
        poolExists[pool] = true;
        // update total pool weight of the factory
        totalWeight += weight;

        // emit an event
        emit PoolRegistered(msg.sender, poolToken, address(pool), weight, isFlashPool);
    }

    /// @inheritdoc IFactory
    function updateILVPerSecond() external override {
        // checks if ratio can be updated i.e. if seconds/update have passed
        require(shouldUpdateRatio(), "too frequent");

        // decreases ILV/second reward by 3%
        ilvPerSecond = (ilvPerSecond * 97) / 100;

        // set current timestamp as the last ratio update timestamp
        lastRatioUpdate = uint32(_now256());

        // emit an event
        emit IlvRatioUpdated(msg.sender, ilvPerSecond);
    }

    /// @inheritdoc IFactory
    function mintYieldTo(
        address _to,
        uint256 _value,
        bool _useSILV
    ) external override {
        // verify that sender is a pool registered withing the factory
        require(poolExists[msg.sender], "access denied");

        if (!_useSILV) {
            ilv.mint(_to, _value);
        } else {
            silv.mint(_to, _value);
        }
    }

    /// @inheritdoc IFactory
    function changePoolWeight(address pool, uint32 weight) external override {
        // verify function is executed either by factory owner or by the pool itself
        require(msg.sender == owner() || poolExists[msg.sender]);

        // recalculate total weight
        totalWeight = totalWeight + weight - pool.weight();

        // set the new pool weight
        IPoolBase(pool).setWeight(weight);

        // emit an event
        emit WeightUpdated(msg.sender, address(pool), weight);
    }

    /// @inheritdoc UUPSUpgradeable
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
