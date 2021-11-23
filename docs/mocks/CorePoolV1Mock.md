## `CorePoolV1Mock`

### `constructor(address _poolToken)` (public)

### `setUsers(struct CorePoolV1Mock.UserParameter[] _userParameter)` (external)

### `changeStakeWeight(address _user, uint256 _stakeId, uint256 _newWeight)` (external)

### `changeStakeValue(address _user, uint256 _stakeId, uint256 _newValue)` (external)

### `getDeposit(address _from, uint256 _stakeId) → uint256, uint256, uint64, uint64, bool` (external)

### `UserParameter`

address userAddress

struct ICorePoolV1.V1Stake[] deposits
