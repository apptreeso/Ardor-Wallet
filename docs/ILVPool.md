## `ILVPool`

### `initialize(address _ilv, address _silv, address _poolToken, address _factory, uint64 _initTime, uint32 _weight, address _corePoolV1, uint256 _v1StakeMaxPeriod)` (external)

see \_\_V2Migrator_init

### `stakeAsPool(address _staker, uint256 _value)` (external)

Executed by other core pools and flash pools
as part of yield rewards processing logic (`_claimYieldRewards` function)
Executed when \_useSILV is false and pool is not an ILV pool - see `IlluviumPoolBase._processRewards`

### `claimYieldRewardsMultiple(address[] _pools, bool[] _useSILV)` (external)

ILV pool works as a router for claiming multiple pools registered
in the factory

calls multiple pools claimYieldRewardsFromRouter() in order to claim yield
in 1 transaction.

### `claimVaultRewardsMultiple(address[] _pools)` (external)

ILV pool works as a router for claiming multiple pools registered
in the factory

calls multiple pools claimVaultRewardsFromRouter() in order to claim yield
in 1 transaction.

### `migrateWeights(address[] _users, uint248[] _yieldWeights, uint248 _totalWeight)` (external)

can be called only by the factory controller
the purpose of this function is to migrate yield weights from v1
in 1 single operation per user so we don't need to store each v1 yield
staked. `mintV1Yield()` function is used to mint v1 yield in v2 instead of using
v1 unstake function.

adds weight to an address according to how much weight the user
had in yield accumulated in staking v1.

### `mintV1Yield(uint256 _stakeId)` (external)

reads v1 core pool yield data (using `_stakeId` and `msg.sender`),
validates, mints ILV according to v1 data and stores a receipt hash

### `mintV1YieldMultiple(uint256[] _stakeIds)` (external)

aggregates in one single mint call multiple yield stakeIds from v1
reads v1 ILV pool to execute checks, if everything is correct, it stores
in memory total amount of yield to be minted and calls the PoolFactory to mint
it to msg.sender

### `LogClaimYieldRewardsMultiple(address from, address[] pools, bool[] useSILV)`

### `LogClaimVaultRewardsMultiple(address from, address[] pool)`

### `LogStakeAsPool(address from, address staker, uint256 value)`

### `LogMigrateWeights(address by, uint256 numberOfUsers, uint248 totalWeight)`

### `LogV1YieldMinted(address from, uint256 stakeId, uint256 value)`

logs mintV1Yield()

### `LogV1YieldMintedMultiple(address from, uint256[] stakeIds, uint256 value)`

logs mintV1Yield()
