// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IlluviumAware } from "./libraries/IlluviumAware.sol";

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
contract PoolFactory is Ownable {
    /**
     * @dev Smart contract unique identifier, a random number
     * @dev Should be regenerated each time smart contact source code is changed
     *      and changes smart contract itself is to be redeployed
     * @dev Generated using https://www.random.org/bytes/
     * TODO: change UID
     */
    uint256 public constant FACTORY_UID = 0xc5cfd88c6e4d7e5c8a03c255f03af23c0918d8e82cac196f57466af3fd4a5ec7;

    /// @dev Auxiliary data structure used only in getPoolData() view function
    struct PoolData {
        // @dev pool token address (like ILV)
        address poolToken;
        // @dev pool address (like deployed core pool instance)
        address poolAddress;
        // @dev pool weight (200 for ILV pools, 800 for ILV/ETH pools - set during deployment)
        uint32 weight;
        // @dev flash pool flag
        bool isFlashPool;
    }

    /**
     * @dev ILV/second determines yield farming reward base
     *      used by the yield pools controlled by the factory
     */
    uint192 public ilvPerSecond;

    /**
     * @dev The yield is distributed proportionally to pool weights;
     *      total weight is here to help in determining the proportion
     */
    uint32 public totalWeight;

    /**
     * @dev ILV/second decreases by 3% every seconds/update
     *      an update is triggered by executing `updateILVPerSecond` public function
     */
    uint32 public immutable secondsPerUpdate;

    /**
     * @dev End time is the last timestamp when ILV/second can be decreased;
     *      it is implied that yield farming stops after that timestamp
     */
    uint32 public endTime;

    /**
     * @dev Each time the ILV/second ratio gets updated, the timestamp
     *      when the operation has occurred gets recorded into `lastRatioUpdate`
     * @dev This timestamp is then used to check if seconds/update `secondsPerUpdate`
     *      has passed when decreasing yield reward by 3%
     */
    uint32 public lastRatioUpdate;

    /// @dev ILV token address
    address public immutable ilv;

    /// @dev sILV token address
    address public immutable silv;

    /// @dev Maps pool token address (like ILV) -> pool address (like core pool instance)
    mapping(address => address) public pools;

    /// @dev Keeps track of registered pool addresses, maps pool address -> exists flag
    mapping(address => bool) public poolExists;

    /**
     * @dev Fired in createPool() and registerPool()
     *
     * @param _by an address which executed an action
     * @param poolToken pool token address (like ILV)
     * @param poolAddress deployed pool instance address
     * @param weight pool weight
     * @param isFlashPool flag indicating if pool is a flash pool
     */
    event PoolRegistered(
        address indexed _by,
        address indexed poolToken,
        address indexed poolAddress,
        uint64 weight,
        bool isFlashPool
    );

    /**
     * @dev Fired in changePoolWeight()
     *
     * @param _by an address which executed an action
     * @param poolAddress deployed pool instance address
     * @param weight new pool weight
     */
    event WeightUpdated(address indexed _by, address indexed poolAddress, uint32 weight);

    /**
     * @dev Fired in updateILVPerSecond()
     *
     * @param _by an address which executed an action
     * @param newIlvPerSecond new ILV/second value
     */
    event IlvRatioUpdated(address indexed _by, uint256 newIlvPerSecond);

    /**
     * @dev Creates/deploys a factory instance
     *
     * @param _ilv ILV ERC20 token address
     * @param _silv sILV ERC20 token address
     * @param _ilvPerSecond initial ILV/second value for rewards
     * @param _secondsPerUpdate how frequently the rewards gets updated (decreased by 3%), seconds
     * @param _initTime timestamp to measure _secondsPerUpdate from
     * @param _endTime timestamp number when farming stops and rewards cannot be updated anymore
     */
    constructor(
        address _ilv,
        address _silv,
        uint192 _ilvPerSecond,
        uint32 _secondsPerUpdate,
        uint32 _initTime,
        uint32 _endTime
    ) IlluviumAware(_ilv) {
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

    /**
     * @notice Given a pool token retrieves corresponding pool address
     *
     * @dev A shortcut for `pools` mapping
     *
     * @param poolToken pool token address (like ILV) to query pool address for
     * @return pool address for the token specified
     */
    function getPoolAddress(address poolToken) external view returns (address) {
        // read the mapping and return
        return pools[poolToken];
    }

    /**
     * @notice Reads pool information for the pool defined by its pool token address,
     *      designed to simplify integration with the front ends
     *
     * @param _poolToken pool token address to query pool information for
     * @return pool information packed in a PoolData struct
     */
    function getPoolData(address _poolToken) public view returns (PoolData memory) {
        // get the pool address from the mapping
        address poolAddr = pools[_poolToken];

        // throw if there is no pool registered for the token specified
        require(poolAddr != address(0), "pool not found");

        // read pool information from the pool smart contract
        // via the pool interface (IPool)
        address poolToken = IPool(poolAddr).poolToken();
        bool isFlashPool = IPool(poolAddr).isFlashPool();
        uint32 weight = IPool(poolAddr).weight();

        // create the in-memory structure and return it
        return PoolData({ poolToken: poolToken, poolAddress: poolAddr, weight: weight, isFlashPool: isFlashPool });
    }

    /**
     * @dev Verifies if `secondsPerUpdate` has passed since last ILV/second
     *      ratio update and if ILV/second reward can be decreased by 3%
     *
     * @return true if enough time has passed and `updateILVPerSecond` can be executed
     */
    function shouldUpdateRatio() public view returns (bool) {
        // if yield farming period has ended
        if (now256() > endTime) {
            // ILV/second reward cannot be updated anymore
            return false;
        }

        // check if seconds/update have passed since last update
        return now256() >= lastRatioUpdate + secondsPerUpdate;
    }

    /**
     * @dev Creates a core pool (IlluviumCorePool) and registers it within the factory
     *
     * @dev Can be executed by the pool factory owner only
     *
     * @param poolToken pool token address (like ILV, or ILV/ETH pair)
     * @param initTime init time to be used for the pool created
     * @param weight weight of the pool to be created
     */
    function createPool(
        address poolToken,
        uint64 initTime,
        uint32 weight
    ) external virtual onlyOwner {
        // create/deploy new core pool instance
        IPool pool = new IlluviumCorePool(ilv, silv, this, poolToken, initTime, weight);

        // register it within a factory
        registerPool(address(pool));
    }

    /**
     * @dev Registers an already deployed pool instance within the factory
     *
     * @dev Can be executed by the pool factory owner only
     *
     * @param poolAddr address of the already deployed pool instance
     */
    function registerPool(address poolAddr) public onlyOwner {
        // read pool information from the pool smart contract
        // via the pool interface (IPool)
        address poolToken = IPool(poolAddr).poolToken();
        bool isFlashPool = IPool(poolAddr).isFlashPool();
        uint32 weight = IPool(poolAddr).weight();

        // create pool structure, register it within the factory
        pools[poolToken] = poolAddr;
        poolExists[poolAddr] = true;
        // update total pool weight of the factory
        totalWeight += weight;

        // emit an event
        emit PoolRegistered(msg.sender, poolToken, poolAddr, weight, isFlashPool);
    }

    /**
     * @notice Decreases ILV/second reward by 3%, can be executed
     *      no more than once per `secondsPerUpdate` seconds
     */
    function updateILVPerSecond() external {
        // checks if ratio can be updated i.e. if seconds/update have passed
        require(shouldUpdateRatio(), "too frequent");

        // decreases ILV/second reward by 3%
        ilvPerSecond = (ilvPerSecond * 97) / 100;

        // set current timestamp as the last ratio update timestamp
        lastRatioUpdate = uint32(now256());

        // emit an event
        emit IlvRatioUpdated(msg.sender, ilvPerSecond);
    }

    /**
     * @dev Mints ILV tokens; executed by ILV Pool only
     *
     * @dev Requires factory to have ROLE_TOKEN_CREATOR permission
     *      on the ILV ERC20 token instance
     *
     * @param _to an address to mint tokens to
     * @param _amount amount of ILV tokens to mint
     */
    function mintYieldTo(
        address _to,
        uint256 _amount,
        bool _useSILV
    ) external {
        // verify that sender is a pool registered withing the factory
        require(poolExists[msg.sender], "access denied");

        if (!_useSILV) {
            ilv.mint(_to, _amount);
        } else {
            silv.mint(_to, _amount);
        }
    }

    /**
     * @dev Changes the weight of the pool;
     *      executed by the pool itself or by the factory owner
     *
     * @param poolAddr address of the pool to change weight for
     * @param weight new weight value to set to
     */
    function changePoolWeight(address poolAddr, uint32 weight) external {
        // verify function is executed either by factory owner or by the pool itself
        require(msg.sender == owner() || poolExists[msg.sender]);

        // recalculate total weight
        totalWeight = totalWeight + weight - IPool(poolAddr).weight();

        // set the new pool weight
        IPool(poolAddr).setWeight(weight);

        // emit an event
        emit WeightUpdated(msg.sender, poolAddr, weight);
    }

    /**
     * @dev Testing time-dependent functionality is difficult and the best way of
     *      doing it is to override time in helper test smart contracts
     *
     * @return `block.timestamp` in mainnet, custom values in testnets (if overridden)
     */
    function now256() public view virtual returns (uint256) {
        // return current block timestamp
        return block.timestamp;
    }
}
