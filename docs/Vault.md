## `Vault`

Integration with sushi router.
     Receives ETH from an address that exists on IMX which collects in-game purchases
     (although technically it could receive ETH from anywhere)





### `constructor(address _sushiRouter, address _ilv)` (public)

Creates (deploys) Vault linked to Sushi AMM Router and IlluviumERC20 token





### `setCorePools(contract ICorePoolV1 _ilvPoolV1, contract ICorePoolV1 _pairPoolV1, contract ICorePool _ilvPool, contract ICorePool _pairPool, contract ICorePool _lockedPoolV1, contract ICorePool _lockedPoolV2)` (external)



Auxiliary function used as part of the contract setup process to setup core pools,
     executed by `owner()` after deployment



### `swapETHForILV(uint256 _ethIn, uint256 _ilvOut, uint256 _deadline)` (external)

Exchanges ETH balance present on the contract into ILV via Uniswap



Logs operation via `EthIlvSwapped` event



### `sendILVRewards(uint256 _ethIn, uint256 _ilvOut, uint256 _deadline)` (external)

Converts an entire contract's ETH balance into ILV via Uniswap and
     sends the entire contract's ILV balance to the Illuvium Yield Pool



Uses `swapEthForIlv` internally to exchange ETH -> ILV

Logs operation via `RewardsDistributed` event

Set `ilvOut` or `deadline` to zero to skip `swapEthForIlv` call



### `estimatePairPoolReserve(address _pairPool) → uint256 ilvAmount` (public)



Auxiliary function used to estimate LP core pool share among 2 other core pools.
     Since LP pool holds ILV in both paired and unpaired forms, this creates some complexity to
     properly estimate LP pool share among 2 other pools which contain ILV tokens only

The function counts for ILV held in LP pool in unpaired form as is,
     for the paired ILV it estimates its amount based on the LP token share the pool has



### `receive()` (external)

Default payable function, allows to top up contract's ETH balance
     to be exchanged into ILV via Uniswap



Logs operation via `LogEthReceived` event


### `LogSwapEthForILV(address by, uint256 ethSpent, uint256 ilvReceived)`



Fired in _swapEthForIlv() and sendIlvRewards() (via swapEthForIlv)



### `LogSendILVRewards(address by, uint256 value)`



Fired in sendIlvRewards()



### `LogEthReceived(address by, uint256 value)`



Fired in default payable receive()



### `LogSetCorePools(address by, address ilvPoolV1, address pairPoolV1, address ilvPool, address pairPool, address lockedPoolV1, address lockedPoolV2)`



Fired in setCorePools()




### `Pools`


contract ICorePoolV1 ilvPoolV1


contract ICorePoolV1 pairPoolV1


contract ICorePool ilvPool


contract ICorePool pairPool


contract ICorePool lockedPoolV1


contract ICorePool lockedPoolV2



