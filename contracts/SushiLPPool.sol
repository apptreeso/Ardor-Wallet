// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { V2Migrator } from "./base/V2Migrator.sol";
import { ErrorHandler } from "./libraries/ErrorHandler.sol";

/**
 * @title The Sushi LP Pool.
 *
 * @dev Extends all functionality from V2Migrator contract, there isn't a lot of
 *      additions compared to ILV pool. Sushi LP pool basically needs to be able
 *      to be called by ILV pool in batch calls where we claim rewards from multiple
 *      pools.
 */
contract SushiLPPool is V2Migrator {
    using ErrorHandler for bytes4;

    /// @dev Calls __V2Migrator_init().
    function initialize(
        address _ilv,
        address _silv,
        address _poolToken,
        address _factory,
        uint64 _initTime,
        uint32 _weight,
        address _corePoolV1,
        uint256 _v1StakeMaxPeriod
    ) external initializer {
        __V2Migrator_init(_ilv, _silv, _poolToken, _corePoolV1, _factory, _initTime, _weight, _v1StakeMaxPeriod);
    }

    /**
     * @notice This function can be called only by ILV core pool.
     *
     * @dev Uses ILV pool as a router by receiving the _staker address and executing
     *      the internal `_claimYieldRewards()`.
     * @dev Its usage allows claiming multiple pool contracts in one transaction.
     *
     * @param _staker user address
     * @param _useSILV whether it should claim pendingYield as ILV or sILV
     */
    function claimYieldRewardsFromRouter(address _staker, bool _useSILV) external virtual updatePool {
        _requireNotPaused();
        _requirePoolIsValid();

        _claimYieldRewards(_staker, _useSILV);
    }

    /**
     * @notice This function can be called only by ILV core pool.
     *
     * @dev Uses ILV pool as a router by receiving the _staker address and executing
     *      the internal `_claimVaultRewards()`.
     * @dev Its usage allows claiming multiple pool contracts in one transaction.
     *
     * @param _staker user address
     */
    function claimVaultRewardsFromRouter(address _staker) external virtual updatePool {
        _requireNotPaused();
        _requirePoolIsValid();

        _claimVaultRewards(_staker);
    }

    /**
     * @dev Checks if caller is ILV pool.
     * @dev We are using an internal function instead of a modifier in order to
     *      reduce the contract's bytecode size.
     */
    function _requirePoolIsValid() internal view {
        // we're using selector to simplify input and state validation
        // internal function simulated selector is `keccak256("_requirePoolIsValid()")`
        bytes4 fnSelector = 0x250f303f;

        bool poolIsValid = address(factory.pools(ilv)) == msg.sender;
        fnSelector.verifyState(poolIsValid, 0);
    }
}
