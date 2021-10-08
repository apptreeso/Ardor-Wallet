## `V2Migrator`

### `__V2Migrator_init(address _ilv, address _silv, address _poolToken, address _factory, uint64 _initTime, uint32 _weight, address _corePoolV1, uint256 _v1StakeMaxPeriod)` (internal)

V2Migrator initializer function

### `migrateLockedStake(uint256[] _stakeIds)` (external)

only `msg.sender` can migrate v1 stakes to v2

reads v1 core pool locked stakes data (by looping through the `_stakeIds` array),
checks if it's a valid v1 stake to migrate and save the id to v2 user struct

### `LogMigrateLockedStake(address from, uint256[] stakeIds)`

logs migrateLockedStake()
