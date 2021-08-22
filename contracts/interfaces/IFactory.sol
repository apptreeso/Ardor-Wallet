// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { IPoolBase } from "./IPoolBase.sol";

interface IFactory {
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
     * @dev Smart contract unique identifier, a random number
     * @dev Should be regenerated each time smart contact source code is changed
     *      and changes smart contract itself is to be redeployed
     * @dev Generated using https://www.random.org/bytes/
     */
    function FACTORY_UID() external view returns (uint256);

    /**
     * @dev ILV/second determines yield farming reward base
     *      used by the yield pools controlled by the factory
     */
    function ilvPerSecond() external view returns (uint192);

    /**
     * @dev The yield is distributed proportionally to pool weights;
     *      total weight is here to help in determining the proportion
     */
    function totalWeight() external view returns (uint32);

    /**
     * @dev ILV/second decreases by 3% every seconds/update
     *      an update is triggered by executing `updateILVPerSecond` public function
     */
    function secondsPerUpdate() external view returns (uint32);

    /**
     * @dev End time is the last timestamp when ILV/second can be decreased;
     *      it is implied that yield farming stops after that timestamp
     */
    function endTime() external view returns (uint32);

    /**
     * @dev Each time the ILV/second ratio gets updated, the timestamp
     *      when the operation has occurred gets recorded into `lastRatioUpdate`
     * @dev This timestamp is then used to check if seconds/update `secondsPerUpdate`
     *      has passed when decreasing yield reward by 3%
     */
    function lastRatioUpdate() external view returns (uint32);

    /// @dev ILV token address
    function ilv() external view returns (address);

    /// @dev sILV token address
    function silv() external view returns (address);

    /// @dev Maps pool token address (like ILV) -> pool address (like core pool instance)
    function pools(address _poolToken) external view returns (IPoolBase);

    /// @dev Keeps track of registered pool addresses, maps pool address -> exists flag
    function poolExists(address _poolAddress) external view returns (bool);

    /**
     * @notice Given a pool token retrieves corresponding pool address
     *
     * @dev A shortcut for `pools` mapping
     *
     * @param poolToken pool token address (like ILV) to query pool address for
     * @return pool address for the token specified
     */
    function getPoolAddress(address poolToken) external view returns (address);

    /**
     * @notice Reads pool information for the pool defined by its pool token address,
     *      designed to simplify integration with the front ends
     *
     * @param _poolToken pool token address to query pool information for
     * @return pool information packed in a PoolData struct
     */
    function getPoolData(address _poolToken) external view returns (PoolData memory);

    /**
     * @dev Verifies if `secondsPerUpdate` has passed since last ILV/second
     *      ratio update and if ILV/second reward can be decreased by 3%
     *
     * @return true if enough time has passed and `updateILVPerSecond` can be executed
     */
    function shouldUpdateRatio() external view returns (bool);

    /**
     * @dev Creates a core pool (CorePool) and registers it within the factory
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
    ) external;

    /**
     * @dev Registers an already deployed pool instance within the factory
     *
     * @dev Can be executed by the pool factory owner only
     *
     * @param pool address of the already deployed pool instance
     */
    function registerPool(IPoolBase pool) external;

    /**
     * @notice Decreases ILV/second reward by 3%, can be executed
     *      no more than once per `secondsPerUpdate` seconds
     */
    function updateILVPerSecond() external;

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
    ) external;

    /**
     * @dev Changes the weight of the pool;
     *      executed by the pool itself or by the factory owner
     *
     * @param pool address of the pool to change weight for
     * @param weight new weight value to set to
     */
    function changePoolWeight(IPoolBase pool, uint32 weight) external;
}
