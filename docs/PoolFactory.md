## `PoolFactory`

ILV Pool Factory manages Illuvium Yield farming pools, provides a single
public interface to access the pools, provides an interface for the pools
to mint yield rewards, access pool-related info, update weights, etc.

The factory is authorized (via its owner) to register new pools, change weights
of the existing pools, removing the pools (by changing their weights to zero)

The factory requires ROLE_TOKEN_CREATOR permission on the ILV token to mint yield
(see `mintYieldTo` function)

### `initialize(address _ilv, address _silv, uint192 _ilvPerSecond, uint32 _secondsPerUpdate, uint32 _initTime, uint32 _endTime)` (external)

Initializes a factory instance

### `getPoolAddress(address poolToken) → address` (external)

### `getPoolData(address _poolToken) → struct PoolFactory.PoolData` (public)

### `shouldUpdateRatio() → bool` (public)

### `registerPool(address pool)` (public)

### `updateILVPerSecond()` (external)

### `mintYieldTo(address _to, uint256 _value, bool _useSILV)` (external)

### `changePoolWeight(address pool, uint32 weight)` (external)

### `setEndTime(uint32 _endTime)` (external)

### `_authorizeUpgrade(address)` (internal)

Function that should revert when `msg.sender` is not authorized to upgrade the contract. Called by
{upgradeTo} and {upgradeToAndCall}.
Normally, this function will use an xref:access.adoc[access control] modifier such as {Ownable-onlyOwner}.

```solidity
function _authorizeUpgrade(address) internal override onlyOwner {}

```

### `LogRegisterPool(address by, address poolToken, address poolAddress, uint64 weight, bool isFlashPool)`

Fired in registerPool()

### `LogChangePoolWeight(address by, address poolAddress, uint32 weight)`

Fired in changePoolWeight()

### `LogUpdateILVPerSecond(address by, uint256 newIlvPerSecond)`

Fired in updateILVPerSecond()

### `LogSetEndTime(address by, uint32 endTime)`

Fired in setEndTime()

### `PoolData`

address poolToken

address poolAddress

uint32 weight

bool isFlashPool
