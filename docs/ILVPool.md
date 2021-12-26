## `ILVPool`

ILV Pool contract to be deployed, with all base contracts inherited.
Extends functionality working as a router to SushiLP Pool and deployed flash pools.
through functions like `claimYieldRewardsMultiple()` and `claimVaultRewardsMultiple()`,
ILV Pool is trusted by other pools and verified by the factory to aggregate functions
and add quality of life features for stakers.

### `initialize(address _ilv, address silv_, address _poolToken, address _factory, uint64 _initTime, uint32 _weight, address _corePoolV1, uint256 _v1StakeMaxPeriod)` (external)

Calls `__V2Migrator_init()`.

### `setMerkleRoot(bytes32 _merkleRoot)` (external)

Sets the yield weight tree root.

### `hasMigratedYield(uint256 _index) → bool` (public)

Returns whether an user of a given \_index in the bitmap has already
migrated v1 yield weight stored in the merkle tree or not.

### `stakeAsPool(address _staker, uint256 _value)` (external)

Executed by other core pools and flash pools
as part of yield rewards processing logic (`_claimYieldRewards()` function).
Executed when \_useSILV is false and pool is not an ILV pool -
see `CorePool._processRewards()`.

### `executeMigration(bytes32[] _proof, uint256 _index, uint248 _yieldWeight, uint256[] _stakeIds)` (external)

Calls internal `_migrateLockedStakes` and _`migrateYieldWeights`
functions for a complete migration of a v1 user to v2.
See `_migrateLockedStakes` and _`migrateYieldWeights`.

### `claimYieldRewardsMultiple(address[] _pools, bool[] _useSILV)` (external)

ILV pool works as a router for claiming multiple pools registered
in the factory.

Calls multiple pools claimYieldRewardsFromRouter() in order to claim yield
in 1 transaction.

### `claimVaultRewardsMultiple(address[] _pools)` (external)

ILV pool works as a router for claiming multiple pools registered
in the factory

Calls multiple pools claimVaultRewardsFromRouter() in order to claim yield
in 1 transaction.

### `mintV1YieldMultiple(uint256[] _stakeIds)` (external)

Aggregates in one single mint call multiple yield stakeIds from v1.
reads v1 ILV pool to execute checks, if everything is correct, it stores
in memory total amount of yield to be minted and calls the PoolFactory to mint
it to msg.sender.

### `LogV1YieldMintedMultiple(address from, uint256 value)`

logs `mintV1Yield()`.
