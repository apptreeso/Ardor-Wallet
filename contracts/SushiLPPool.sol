// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { V2Migrator } from "./base/V2Migrator.sol";

/**
 * @title The Sushi LP Pool.
 *
 * @dev Extends all functionality from V2Migrator contract, there isn't a lot of
 *      additions compared to ILV pool. Sushi LP pool basically needs to be able
 *      to be called by ILV pool in batch calls where we claim rewards from multiple
 *      pools.
 */
contract SushiLPPool is V2Migrator {
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
    function claimYieldRewardsFromRouter(address _staker, bool _useSILV) external virtual {
        _sync();
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
    function claimVaultRewardsFromRouter(address _staker) external virtual {
        _sync();
        _requireNotPaused();
        _requirePoolIsValid();

        _claimVaultRewards(_staker);
    }

    /// @dev Checks if caller is ILVPool.
    function _requirePoolIsValid() internal view {
        bool poolIsValid = address(factory.pools(ilv)) == msg.sender;
        require(poolIsValid);
    }
}
