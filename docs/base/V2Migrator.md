## `V2Migrator`

V2Migrator inherits all CorePool base contract functionaltiy, and adds
v1 to v2 migration related functions. This is a core smart contract of
Sushi LP and ILV pools, and manages users locked and yield weights coming
from v1.
Parameters need to be reviewed carefully before deployment for the migration process.
Users will migrate their locked stakes, which are stored in the contract,
and v1 total yield weights by data stored in a merkle tree using merkle proofs.

### `__V2Migrator_init(address _ilv, address _silv, address _poolToken, address _factory, uint64 _initTime, uint32 _weight, address _corePoolV1, uint256 _v1StakeMaxPeriod)` (internal)

V2Migrator initializer function

### `migrateLockedStake(uint256[] _stakeIds)` (external)

Reads v1 core pool locked stakes data (by looping through the `_stakeIds` array),
checks if it's a valid v1 stake to migrate and save the id to v2 user struct.

Only `msg.sender` can migrate v1 stakes to v2.

### `LogMigrateLockedStake(address from, uint256[] stakeIds)`

logs `migrateLockedStake()`
