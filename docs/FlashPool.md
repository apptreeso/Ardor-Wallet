## `FlashPool`

### `updatePool()`

used for functions that require syncing contract state before execution

### `initialize(address _ilv, address _silv, address _poolToken, address _factory, uint64 _initTime, uint64 _endTime, uint32 _weight)` (external)

Initializes a new flash pool.

### `pendingYieldRewards(address _staker) → uint256 pending` (external)

Calculates current yield rewards value available for address specified

see \_pendingYieldRewards() for further details

### `balanceOf(address _user) → uint256 balance` (external)

Returns total staked token balance for the given address

### `isPoolDisabled() → bool` (public)

Checks if flash pool has ended. Flash pool is considered "disabled"
once time reaches its "end time".

### `stake(uint256 _value)` (external)

stakes poolTokens without lock

### `migrateUser(address _to)` (external)

data is copied to memory so we can delete previous address data
before we store it in new address

migrates msg.sender data to a new address

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

### `claimYieldRewardsFromRouter(address _staker, bool _useSILV)` (external)

this function can be called only by ILV core pool

uses ILV pool as a router by receiving the \_staker address and executing
the internal \_claimYieldRewards()
its usage allows claiming multiple pool contracts in one transaction

### `setWeight(uint32 _weight)` (external)

Executed by the factory to modify pool weight; the factory is expected
to keep track of the total pools weight when updating

Set weight to zero to disable the pool

### `setEndTime(uint64 _newEndTime)` (external)

Updates flash pool ending timestamp.

### `_pendingYieldRewards(address _staker) → uint256 pending` (internal)

Similar to public pendingYieldRewards, but performs calculations based on
current smart contract state only, not taking into account any additional
time which might have passed.

### `unstake(uint256 _value)` (external)

### `_sync()` (internal)

Used internally, mostly by children implementations, see sync()

Updates smart contract state (`yieldRewardsPerToken`, `lastYieldDistribution`),
updates factory state via `updateILVPerSecond`

### `_processRewards(address _staker) → uint256 pendingYield` (internal)

Used internally, mostly by children implementations.
Executed before staking, unstaking and claiming the rewards.
When timing conditions are not met (executed too frequently, or after factory
end time), function doesn't throw and exits silently

### `_claimYieldRewards(address _staker, bool _useSILV)` (internal)

sILV is minted straight away to \_staker wallet, ILV is created as
a new stake and locked for Stake.MAX_STAKE_PERIOD

claims all pendingYield from \_staker using ILV or sILV

### `_tokensToReward(uint256 _value, uint256 __rewardPerToken) → uint256` (internal)

Converts number of tokens staked to ILV reward value, applying the
10^12 division on number of tokens (`_value`)

### `_rewardPerToken(uint256 _reward, uint256 _totalStaked) → uint256` (internal)

Converts reward ILV value to reward/tokens

### `_authorizeUpgrade(address)` (internal)

Function that should revert when `msg.sender` is not authorized to upgrade the contract. Called by
{upgradeTo} and {upgradeToAndCall}.
Normally, this function will use an xref:access.adoc[access control] modifier such as {Ownable-onlyOwner}.

```solidity
function _authorizeUpgrade(address) internal override onlyOwner {}

```

### `LogStake(address from, uint256 value)`

Fired in stake().

### `LogUnstake(address to, uint256 value)`

Fired in unstake().

### `LogSync(address by, uint256 yieldRewardsPerToken, uint64 lastYieldDistribution)`

Fired in \_sync(), sync() and dependent functions (stake, unstake, etc.).

### `LogClaimYieldRewards(address from, bool sILV, uint256 value)`

Fired in \_claimYieldRewards().

### `LogProcessRewards(address from, uint256 value)`

Fired in \_processRewards().

### `LogSetWeight(address by, uint32 fromVal, uint32 toVal)`

Fired in setWeight().

### `LogMigrateUser(address from, address to)`

fired in migrateUser().

### `User`

uint128 balance

uint128 pendingYield

uint256 subYieldRewards
