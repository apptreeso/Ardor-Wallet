## `VaultRecipient`






### `setVault(address _vault)` (external)



Executed only by the factory owner to Set the vault.



### `_requireIsVault()` (internal)



Utility function to check if caller is the Vault contract


### `LogSetVault(address by, address previousVault, address newVault)`



Fired in `setVault()`.





