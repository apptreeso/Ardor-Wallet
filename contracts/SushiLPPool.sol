// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { V2Migrator } from "./base/V2Migrator.sol";

contract SushiLPPool is V2Migrator {
    /// @dev see __V2Migrator_init()
    function initialize(
        address _ilv,
        address _silv,
        address _poolToken,
        address _corePoolV1,
        address _factory,
        uint64 _initTime,
        uint32 _weight,
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

    /// @dev Checks if caller is ILVPool.
    function _requirePoolIsValid() internal view {
        bool poolIsValid = address(factory.pools(ilv)) == msg.sender;
        require(poolIsValid);
    }
}
