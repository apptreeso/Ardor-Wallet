## `CorePool`

An abstract contract containing common logic for ILV and ILV/ETH SLP pools

Deployment and initialization.
After proxy is deployed and attached to the implementation, it should be
registered by the PoolFactory contract
Additionally, 3 token instance addresses must be defined on deployment: - ILV token address - sILV token address, used to mint sILV rewards - pool token address, it can be ILV token address, ILV/ETH pair address, and others

Pool weight defines the fraction of the yield current pool receives among the other pools,
pool factory is responsible for the weight synchronization between the pools.
The weight is logically 10% for ILV pool and 80% for ILV/ETH pool initially.
It can be changed through ICCPs and new flash pools added in the protocol.
Since Solidity doesn't support fractions the weight is defined by the division of
pool weight by total pools weight (sum of all registered pools within the factory)
For ILV Pool we use 200 as weight and for ILV/ETH SLP pool - 800.

### `updatePool()`

Used for functions that require syncing contract state before execution.

### `__CorePool_init(address _ilv, address _silv, address _poolToken, address _corePoolV1, address _factory, uint64 _initTime, uint32 _weight)` (internal)

Used in child contracts to initialize the pool.

### `pendingRewards(address _staker) → uint256 pendingYield, uint256 pendingRevDis` (external)

Calculates current yield rewards value available for address specified.

see `_pendingRewards()` for further details.

external `pendingRewards()` returns pendingYield and pendingRevDis
accumulated with already stored user.pendingYield and user.pendingRevDis.

### `balanceOf(address _user) → uint256 balance` (external)

Returns total staked token balance for the given address.

loops through stakes and returns total balance.

### `getStake(address _user, uint256 _stakeId) → struct Stake.Data` (external)

Returns information on the given stake for the given address.

See getStakesLength.

### `getV1StakeId(address _user, uint256 _position) → uint256` (external)

Returns a v1 stake id in the `user.v1StakesIds` array.

Get v1 stake id position through `getV1StakePosition()`.

### `getV1StakePosition(address _user, uint256 _desiredId) → uint256 position` (external)

Returns a v1 stake position in the `user.v1StakesIds` array.

helper function to call `getV1StakeId()`.

### `getStakesLength(address _user) → uint256` (external)

Returns number of stakes for the given address. Allows iteration over stakes.

See `getStake()`.

### `stakePoolToken(uint256 _value, uint64 _lockDuration)` (external)

Stakes specified value of tokens for the specified value of time,
and pays pending yield rewards if any.

Requires value to stake and lock duration to be greater than zero.

### `migrateUser(address _to)` (external)

Migrates msg.sender data to a new address.
V1 stakes are never migrated to the new address. We process all rewards,
clean the previous user (msg.sender), add the previous user data to
the desired address and update subYieldRewards/subVaultRewards values
in order to make sure both addresses will have rewards cleaned.

### `fillV1StakeId(uint256 _v1StakeId, uint256 _stakeIdPosition)` (external)

Allows an user that is currently in v1 with locked tokens, that have
just been unlocked, to transfer to v2 and keep the same weight that was
used in v1.

### `sync()` (external)

Service function to synchronize pool state with current time.

Can be executed by anyone at any time, but has an effect only when
at least one second passes between synchronizations.
Executed internally when staking, unstaking, processing rewards in order
for calculations to be correct and to reflect state progress of the contract.
When timing conditions are not met (executed too frequently, or after factory
end time), function doesn't throw and exits silently.

### `claimYieldRewards(bool _useSILV)` (external)

Pool state is updated before calling the internal function.

Calls internal `_claimYieldRewards()` passing `msg.sender` as `_staker`.

### `claimVaultRewards()` (external)

Pool state is updated before calling the internal function.

Calls internal `_claimVaultRewards()` passing `msg.sender` as `_staker`.

### `receiveVaultRewards(uint256 _value)` (external)

Executed by the vault to transfer vault rewards ILV from the vault
into the pool.

This function is executed only for ILV core pools.

### `setWeight(uint32 _weight)` (external)

Executed by the factory to modify pool weight; the factory is expected
to keep track of the total pools weight when updating.

Set weight to zero to disable the pool.

### `_pendingRewards(address _staker, uint256 _totalV1Weight, uint256 _subYieldRewards, uint256 _subVaultRewards) → uint256 pendingYield, uint256 pendingRevDis` (internal)

Similar to public pendingYieldRewards, but performs calculations based on
current smart contract state only, not taking into account any additional
time which might have passed.
It performs a check on v1StakesIds and calls the corresponding V1 core pool
in order to add v1 weight into v2 yield calculations.

V1 weight is kept the same used in v1, as a bonus to V1 stakers.

pending values retured are used by `_processRewards()` calls, which means
we aren't counting `user.pendingYield` and `user.pendingRevDis` here.

### `_stake(address _staker, uint256 _value, uint64 _lockDuration)` (internal)

Used internally, mostly by children implementations, see `stake()`.

### `unstakeLocked(uint256 _stakeId, uint256 _value)` (external)

Unstakes a stake that has been previously locked, and is now in an unlocked
state. If the stake has the isYield flag set to true, then the contract
requests ILV to be minted by the PoolFactory. Otherwise it transfers ILV or LP
from the contract balance.

### `unstakeLockedMultiple(struct CorePool.UnstakeParameter[] _stakes, bool _unstakingYield)` (external)

Executes unstake on multiple stakeIds. See `unstakeLocked()`.
Optimizes gas by requiring all unstakes to be made either in yield stakes
or in non yield stakes. That way we can transfer or mint tokens in one call.

### `_sync()` (internal)

Used internally, mostly by children implementations, see `sync()`.

Updates smart contract state (`yieldRewardsPerWeight`, `lastYieldDistribution`),
updates factory state via `updateILVPerSecond`

### `_processRewards(address _staker, uint256 _v1WeightToAdd, uint256 _subYieldRewards, uint256 _subVaultRewards) → uint256 pendingYield, uint256 pendingRevDis` (internal)

Used internally, mostly by children implementations.
Executed before staking, unstaking and claiming the rewards.
updates user.pendingYield and user.pendingRevDis.
When timing conditions are not met (executed too frequently, or after factory
end block), function doesn't throw and exits silently.

### `_claimYieldRewards(address _staker, bool _useSILV)` (internal)

sILV is minted straight away to \_staker wallet, ILV is created as
a new stake and locked for Stake.MAX_STAKE_PERIOD.

claims all pendingYield from \_staker using ILV or sILV.

### `_claimVaultRewards(address _staker)` (internal)

Claims all pendingRevDis from \_staker using ILV.
ILV is sent straight away to \_staker address.

### `_useV1Weight(address _staker) → uint256 totalV1Weight, uint256 subYieldRewards, uint256 subVaultRewards` (internal)

If v1 weights have changed since last call, we use latest v1 weight for
yield and revenue distribution rewards calculations, and recalculate
user sub rewards values in order to have correct rewards estimations.

Calls CorePoolV1 contract, gets v1 stake ids weight and returns.
Used by `_pendingRewards()` to calculate yield and revenue distribution
rewards taking v1 weights into account.

### `_getSubRewardsValue(uint256 _subRewardsStored, uint256 _totalWeightStored, uint256 _totalV1Weight, uint256 _previousTotalV1Weight) → uint256 subRewards` (internal)

Recalculates subYieldRewards or subVaultRewards using most recent
\_totalV1Weight, by getting previous `yieldRewardsPerWeight` used in
last subYieldRewards or subVaultRewards update (through `_previousTotalV1Weight`)
and returns equivalent value using most recent v1 weight.

This function is very important in order to keep calculations correct even
after an user unstakes in v1.

If an user in v1 unstakes before claiming yield in v2, it will be considered
as if the user has been accumulating yield and revenue distributions
with most recent weight since the last user.subYieldRewards and
user.subVaultRewards update.
v1 stake token amount of a given stakeId can never increase in v1 contracts.
this way we are safe of attacks by adding more tokens in v1 and having
a higher accumulation of yield and revenue distributions

### `_requireNotPaused()` (internal)

Checks if pool is paused

### `_authorizeUpgrade(address)` (internal)

See UUPSUpgradeable `_authorizeUpgrade()`.
Just checks if `msg.sender` == `factory.owner()` i.e eDAO multisig address.
eDAO multisig is responsible by handling upgrades and executing other
admin actions approved by the Council.

### `LogStake(address by, address from, uint256 stakeId, uint256 value, uint64 lockUntil)`

Fired in \_stake() and stakeAsPool() in ILVPool contract.

### `LogUpdateStakeLock(address from, uint256 stakeId, uint64 lockedFrom, uint64 lockedUntil)`

Fired in updateStakeLock().

### `LogUnstakeLocked(address to, uint256 stakeId, uint256 value, bool isYield)`

Fired in `unstakeLocked()`.

### `LogUnstakeLockedMultiple(address to, uint256 totalValue, bool unstakingYield)`

Fired in `unstakeLockedMultiple()`.

### `LogSync(address by, uint256 yieldRewardsPerWeight, uint64 lastYieldDistribution)`

Fired in `_sync()`, `sync()` and dependent functions (stake, unstake, etc.).

### `LogClaimYieldRewards(address by, address from, bool sILV, uint256 stakeId, uint256 value)`

Fired in `_claimYieldRewards()`.

### `LogClaimVaultRewards(address by, address from, uint256 value)`

Fired in `_claimVaultRewards()`.

### `LogProcessRewards(address by, address from, uint256 yieldValue, uint256 revDisValue)`

Fired in `_processRewards()`.

### `LogMigrateUser(address from, address to)`

fired in `migrateUser()`.

### `LogReceiveVaultRewards(address by, uint256 value)`

Fired in `receiveVaultRewards()`.

### `User`

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
