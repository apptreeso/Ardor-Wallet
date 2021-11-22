## `FactoryControlled`



Abstract smart contract responsible to hold IFactory factory address.
Stores PoolFactory address on initialization.



### `__FactoryControlled_init(address _factory)` (internal)



Attachs PoolFactory address to the FactoryControlled contract.

### `_requireIsFactoryController()` (internal)



checks if caller is factory admin (eDAO multisig address).




