## `ICorePool`

### `users(address _user) → uint128, uint128, uint128, uint248, uint8, uint256, uint256` (external)

### `silv() → address` (external)

### `poolToken() → address` (external)

### `isFlashPool() → bool` (external)

### `weight() → uint32` (external)

### `lastYieldDistribution() → uint64` (external)

### `yieldRewardsPerWeight() → uint256` (external)

### `globalWeight() → uint256` (external)

### `pendingRewards(address _user) → uint256, uint256` (external)

### `poolTokenReserve() → uint256` (external)

### `claimYieldRewardsFromRouter(address _staker, bool _useSILV)` (external)

### `claimVaultRewardsFromRouter(address _staker)` (external)

### `balanceOf(address _user) → uint256` (external)

### `getStake(address _user, uint256 _stakeId) → struct Stake.Data` (external)

### `getStakesLength(address _user) → uint256` (external)

### `sync()` (external)

### `setWeight(uint32 _weight)` (external)

### `receiveVaultRewards(uint256 value)` (external)

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
