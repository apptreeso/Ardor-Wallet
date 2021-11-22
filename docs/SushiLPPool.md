## `SushiLPPool`

### `initialize(address _ilv, address _silv, address _poolToken, address _factory, uint64 _initTime, uint32 _weight, address _corePoolV1, uint256 _v1StakeMaxPeriod)` (external)

see \_\_V2Migrator_init()

### `claimYieldRewardsFromRouter(address _staker, bool _useSILV)` (external)

This function can be called only by ILV core pool.

Uses ILV pool as a router by receiving the \_staker address and executing
the internal `_claimYieldRewards()`.
Its usage allows claiming multiple pool contracts in one transaction.

### `claimVaultRewardsFromRouter(address _staker)` (external)

This function can be called only by ILV core pool.

Uses ILV pool as a router by receiving the \_staker address and executing
the internal `_claimVaultRewards()`.
Its usage allows claiming multiple pool contracts in one transaction.

### `_requirePoolIsValid()` (internal)

Checks if caller is ILVPool.
