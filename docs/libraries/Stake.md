## `Stake`

### `weight(struct Stake.Data _self) → uint256` (internal)

### `weightToReward(uint256 _weight, uint256 _rewardPerWeight) → uint256` (internal)

Converts stake weight (not to be mixed with the pool weight) to
ILV reward value, applying the 10^12 division on weight

### `rewardPerWeight(uint256 _reward, uint256 _globalWeight) → uint256` (internal)

Converts reward ILV value to stake weight (not to be mixed with the pool weight),
applying the 10^12 multiplication on the reward. - OR -
Converts reward ILV value to reward/weight if stake weight is supplied as second
function parameter instead of reward/weight.

### `Data`

uint120 value

uint64 lockedFrom

uint64 lockedUntil

bool isYield
