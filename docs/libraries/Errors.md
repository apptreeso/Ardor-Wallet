## `Errors`

Introduces some very common input and state validation for smart contracts,
such as non-zero input validation, general boolean expression validation, access validation

Throws pre-defined errors instead of string error messages to reduce gas costs

Since the library handles only very common errors, concrete smart contracts may
also introduce their own error types and handling

### `verifyNonZeroInput(bytes4 fnSelector, uint256 value, uint8 paramIndex)` (internal)

Verifies an input is set (non-zero)

### `verifyInput(bytes4 fnSelector, bool expr, uint8 paramIndex)` (internal)

Verifies an input is correct

### `verifyState(bytes4 fnSelector, bool expr, uint256 errorCode)` (internal)

Verifies smart contract state is correct

### `verifyAccess(bytes4 fnSelector, bool expr)` (internal)

Verifies an access to the function
