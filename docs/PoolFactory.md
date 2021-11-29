## `PoolFactory`

Pool Factory manages Illuvium staking pools, provides a single
public interface to access the pools, provides an interface for the pools
to mint yield rewards, access pool-related info, update weights, etc.

The factory is authorized (via its owner) to register new pools, change weights
of the existing pools, removing the pools (by changing their weights to zero).

The factory requires ROLE_TOKEN_CREATOR permission on the ILV and sILV tokens to mint yield
(see `mintYieldTo` function).

### `initialize(address _ilv, address _silv, uint192 _ilvPerSecond, uint32 _secondsPerUpdate, uint32 _initTime, uint32 _endTime)` (external)

Initializes a factory instance

### `getPoolAddress(address poolToken) → address` (external)

Given a pool token retrieves corresponding pool address.

A shortcut for `pools` mapping.

### `getPoolData(address _poolToken) → struct PoolFactory.PoolData` (public)

Reads pool information for the pool defined by its pool token address,
designed to simplify integration with the front ends.

### `shouldUpdateRatio() → bool` (public)

Verifies if `secondsPerUpdate` has passed since last ILV/second
ratio update and if ILV/second reward can be decreased by 3%.

### `registerPool(address pool)` (public)

Registers an already deployed pool instance within the factory.

Can be executed by the pool factory owner only.

### `updateILVPerSecond()` (external)

Decreases ILV/second reward by 3%, can be executed
no more than once per `secondsPerUpdate` seconds.

### `mintYieldTo(address _to, uint256 _value, bool _useSILV)` (external)

Mints ILV tokens; executed by ILV Pool only.

Requires factory to have ROLE_TOKEN_CREATOR permission
on the ILV ERC20 token instance.

### `changePoolWeight(address pool, uint32 weight)` (external)

Changes the weight of the pool;
executed by the pool itself or by the factory owner.

### `setEndTime(uint32 _endTime)` (external)

### `_authorizeUpgrade(address)` (internal)

See `CorePool._authorizeUpgrade()`

### `LogRegisterPool(address by, address poolToken, address poolAddress, uint64 weight, bool isFlashPool)`

Fired in registerPool()

### `LogChangePoolWeight(address by, address poolAddress, uint32 weight)`

Fired in `changePoolWeight()`.

### `LogUpdateILVPerSecond(address by, uint256 newIlvPerSecond)`

Fired in `updateILVPerSecond()`.

### `LogSetEndTime(address by, uint32 endTime)`

Fired in `setEndTime()`.

### `PoolData`

address poolToken

address poolAddress

uint32 weight

bool isFlashPool
