## `CorePool`

### `updatePool()`

used for functions that require syncing contract state before execution

### `__CorePool_init(address _ilv, address _silv, address _poolToken, address _factory, uint64 _initTime, uint32 _weight)` (internal)

Overridden in sub-contracts to initialize the pool

### `pendingRewards(address _staker) → uint256 pendingYield, uint256 pendingRevDis` (external)

Calculates current yield rewards value available for address specified

external pendingRewards() returns pendingYield and pendingRevDis
accumulated with already stored user.pendingYield and user.pendingRevDis

see \_pendingRewards() for further details

### `balanceOf(address _user) → uint256 balance` (external)

Returns total staked token balance for the given address

### `getStake(address _user, uint256 _stakeId) → struct Stake.Data` (external)

Returns information on the given stake for the given address

See getStakesLength

### `getV1StakeId(address _user, uint256 _position) → uint256` (external)

Returns a v1 stake id in the `user.v1StakesIds` array

### `getV1StakePosition(address _user, uint256 _desiredId) → uint256 position` (external)

Returns a v1 stake position in the `user.v1StakesIds` array

helper function to call getV1StakeId()

### `getStakesLength(address _user) → uint256` (external)

Returns number of stakes for the given address. Allows iteration over stakes.

See getStake

### `stakeAndLock(uint256 _value, uint64 _lockDuration)` (external)

Stakes specified value of tokens for the specified value of time,
and pays pending yield rewards if any

Requires value to stake to be greater than zero

### `stakeFlexible(uint256 _value)` (external)

we use standard weight for flexible stakes (since it's never locked)

stakes poolTokens without lock

### `migrateUser(address _to)` (external)

data is copied to memory so we can delete previous address data
before we store it in new address

migrates msg.sender data to a new address

### `updateStakeLock(uint256 _stakeId, uint64 _lockedUntil)` (external)

Extends locking period for a given stake

Requires new lockedUntil value to be:
higher than the current one, and
in the future, but
no more than 2 years in the future

### `sync()` (external)

Service function to synchronize pool state with current time

Can be executed by anyone at any time, but has an effect only when
at least one second passes between synchronizations
Executed internally when staking, unstaking, processing rewards in order
for calculations to be correct and to reflect state progress of the contract
When timing conditions are not met (executed too frequently, or after factory
end time), function doesn't throw and exits silently

### `claimYieldRewards(bool _useSILV)` (external)

pool state is updated before calling the internal function

calls internal \_claimYieldRewards() passing `msg.sender` as `_staker`

### `claimVaultRewards()` (external)

pool state is updated before calling the internal function

calls internal \_claimVaultRewards() passing `msg.sender` as `_staker`

### `receiveVaultRewards(uint256 _value)` (external)

Executed by the vault to transfer vault rewards ILV from the vault
into the pool

This function is executed only for ILV core pools

### `setWeight(uint32 _weight)` (external)

Executed by the factory to modify pool weight; the factory is expected
to keep track of the total pools weight when updating

Set weight to zero to disable the pool

### `_pendingRewards(address _staker, uint256 _totalV1Weight, uint256 _subYieldRewards, uint256 _subVaultRewards) → uint256 pendingYield, uint256 pendingRevDis` (internal)

v1 weight is kept the same used in v1, as a bonus to V1 stakers

pending values retured are used by \_processRewards() calls, which means
we aren't counting user.pendingYield and user.pendingRevDis here

Similar to public pendingYieldRewards, but performs calculations based on
current smart contract state only, not taking into account any additional
time which might have passed.
It performs a check on v1StakesIds and calls the corresponding V1 core pool
in order to add v1 weight into v2 yield calculations.

### `_stakeAndLock(address _staker, uint256 _value, uint64 _lockDuration)` (internal)

Used internally, mostly by children implementations, see stake()

### `unstakeFlexible(uint256 _value)` (external)

### `unstakeLocked(uint256 _stakeId, uint256 _value)` (external)

Used internally, mostly by children implementations, see unstake()

### `unstakeLockedMultiple(struct CorePool.UnstakeParameter[] _stakes, bool _unstakingYield)` (external)

### `_sync()` (internal)

Used internally, mostly by children implementations, see sync()

Updates smart contract state (`yieldRewardsPerWeight`, `lastYieldDistribution`),
updates factory state via `updateILVPerSecond`

### `_processRewards(address _staker, uint256 _v1WeightToAdd, uint256 _subYieldRewards, uint256 _subVaultRewards) → uint256 pendingYield, uint256 pendingRevDis` (internal)

Used internally, mostly by children implementations.
Executed before staking, unstaking and claiming the rewards.
When timing conditions are not met (executed too frequently, or after factory
end block), function doesn't throw and exits silently

### `_claimYieldRewards(address _staker, bool _useSILV)` (internal)

sILV is minted straight away to \_staker wallet, ILV is created as
a new stake and locked for 365 days

claims all pendingYield from \_staker using ILV or sILV

### `_claimVaultRewards(address _staker)` (internal)

ILV is sent straight away to \_staker address

claims all pendingRevDis from \_staker using ILV

### `_useV1Weight(address _staker) → uint256 totalV1Weight, uint256 subYieldRewards, uint256 subVaultRewards` (internal)

if v1 weights have changed since last call, we use latest v1 weight for
yield and revenue distribution rewards calculations, and recalculate
user sub rewards values in order to have correct rewards estimations

Calls CorePoolV1 contract, gets v1 stake ids weight and returns
Used by \_pendingRewards to calculate yield and revenue distribution
rewards taking v1 weights into account

### `_getSubRewardsValue(uint256 _subRewardsStored, uint256 _totalWeightStored, uint256 _totalV1Weight, uint256 _previousTotalV1Weight) → uint256 subRewards` (internal)

if an user in v1 unstakes before claiming yield in v2, it will be considered
as if the user has been accumulating yield and revenue distributions
with most recent weight since the last user.subYieldRewards and
user.subVaultRewards update
v1 stake token amount of a given stakeId can never increase in v1 contracts.
this way we are safe of attacks by adding more tokens in v1 and having
a higher accumulation of yield and revenue distributions

recalculates subYieldRewards or subVaultRewards using most recent
\_totalV1Weight, by getting previous `yieldRewardsPerWeight` used in
last subYieldRewards or subVaultRewards update (through \_previousTotalV1Weight)
and returns equivalent value using most recent v1 weight

this function is very important in order to keep calculations correct even
after an user unstakes

### `_requireNotPaused()` (internal)

checks if pool is paused

### `_authorizeUpgrade(address)` (internal)

Function that should revert when `msg.sender` is not authorized to upgrade the contract. Called by
{upgradeTo} and {upgradeToAndCall}.
Normally, this function will use an xref:access.adoc[access control] modifier such as {Ownable-onlyOwner}.

```solidity
function _authorizeUpgrade(address) internal override onlyOwner {}

```

### `LogStakeFlexible(address from, uint256 value)`

Fired in stakeFlexible()

### `LogStakeAndLock(address from, uint256 value, uint64 lockUntil)`

Fired in \_stakeAndLock()

### `LogUpdateStakeLock(address from, uint256 stakeId, uint64 lockedFrom, uint64 lockedUntil)`

Fired in \_updateStakeLock() and updateStakeLock()

### `LogUnstakeFlexible(address to, uint256 value)`

Fired in unstakeFlexible()

### `LogUnstakeLocked(address to, uint256 stakeId, uint256 value)`

Fired in unstakeLocked()

### `LogSync(address by, uint256 yieldRewardsPerWeight, uint64 lastYieldDistribution)`

Fired in \_sync(), sync() and dependent functions (stake, unstake, etc.)

### `LogClaimYieldRewards(address from, bool sILV, uint256 value)`

Fired in \_claimYieldRewards()

### `LogClaimVaultRewards(address from, uint256 value)`

Fired in \_claimVaultRewards()

### `LogProcessRewards(address from, uint256 yieldValue, uint256 revDisValue)`

Fired in \_processRewards()

### `LogSetWeight(address by, uint32 fromVal, uint32 toVal)`

Fired in setWeight()

### `LogMigrateUser(address from, address to)`

fired in migrateUser()

### `LogReceiveVaultRewards(address by, uint256 value)`

Fired in receiveVaultRewards()

### `User`

uint128 flexibleBalance

uint128 pendingYield

uint128 pendingRevDis

uint248 totalWeight

uint8 v1IdsLength

uint256 subYieldRewards

uint256 subVaultRewards

struct Stake.Data[] stakes

mapping(uint256 => uint256) v1StakesIds

### `UnstakeParameter`

uint256 stakeId

uint256 value
