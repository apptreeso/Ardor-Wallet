## `IFactory`

### `owner() → address` (external)

### `FACTORY_UID() → uint256` (external)

Smart contract unique identifier, a random number
Should be regenerated each time smart contact source code is changed
and changes smart contract itself is to be redeployed
Generated using https://www.random.org/bytes/

### `ilvPerSecond() → uint192` (external)

ILV/second determines yield farming reward base
used by the yield pools controlled by the factory

### `totalWeight() → uint32` (external)

The yield is distributed proportionally to pool weights;
total weight is here to help in determining the proportion

### `secondsPerUpdate() → uint32` (external)

ILV/second decreases by 3% every seconds/update
an update is triggered by executing `updateILVPerSecond` public function

### `endTime() → uint32` (external)

End time is the last timestamp when ILV/second can be decreased;
it is implied that yield farming stops after that timestamp

### `lastRatioUpdate() → uint32` (external)

Each time the ILV/second ratio gets updated, the timestamp
when the operation has occurred gets recorded into `lastRatioUpdate`
This timestamp is then used to check if seconds/update `secondsPerUpdate`
has passed when decreasing yield reward by 3%

### `ilv() → address` (external)

ILV token address

### `silv() → address` (external)

sILV token address

### `pools(address _poolToken) → contract ICorePool` (external)

Maps pool token address (like ILV) -> pool address (like core pool instance)

### `poolExists(address _poolAddress) → bool` (external)

Keeps track of registered pool addresses, maps pool address -> exists flag

### `getPoolAddress(address poolToken) → address` (external)

Given a pool token retrieves corresponding pool address

A shortcut for `pools` mapping

### `getPoolData(address _poolToken) → struct IFactory.PoolData` (external)

Reads pool information for the pool defined by its pool token address,
designed to simplify integration with the front ends

### `shouldUpdateRatio() → bool` (external)

Verifies if `secondsPerUpdate` has passed since last ILV/second
ratio update and if ILV/second reward can be decreased by 3%

### `registerPool(contract ICorePool pool)` (external)

Registers an already deployed pool instance within the factory

Can be executed by the pool factory owner only

### `updateILVPerSecond()` (external)

Decreases ILV/second reward by 3%, can be executed
no more than once per `secondsPerUpdate` seconds

### `mintYieldTo(address _to, uint256 _value, bool _useSILV)` (external)

Mints ILV tokens; executed by ILV Pool only

Requires factory to have ROLE_TOKEN_CREATOR permission
on the ILV ERC20 token instance

### `changePoolWeight(contract ICorePool pool, uint32 weight)` (external)

Changes the weight of the pool;
executed by the pool itself or by the factory owner

### `PoolData`

address poolToken

address poolAddress

uint32 weight

bool isFlashPool
