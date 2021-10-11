// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { V2Migrator } from "./base/V2Migrator.sol";
import { Errors } from "./libraries/Errors.sol";

contract SushiLPPool is V2Migrator {
    // err lib used on fn selectors
    using Errors for bytes4;

    /// @dev see __V2Migrator_init()
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
        __V2Migrator_init(_ilv, _silv, _poolToken, _factory, _initTime, _weight, _corePoolV1, _v1StakeMaxPeriod);
    }

    /**
     * @notice this function can be called only by ILV core pool
     *
     * @dev uses ILV pool as a router by receiving the _staker address and executing
     *      the internal _claimYieldRewards()
     * @dev its usage allows claiming multiple pool contracts in one transaction
     *
     * @param _staker user address
     * @param _useSILV whether it should claim pendingYield as ILV or sILV
     */
    function claimYieldRewardsFromRouter(address _staker, bool _useSILV) external virtual updatePool {
        // check contract is not paused
        _requireNotPaused(SushiLPPool(this).claimYieldRewardsFromRouter.selector);
        // verify is being called by ILV pool
        _requireSenderIsIlvPool(SushiLPPool(this).claimYieldRewardsFromRouter.selector);

        // delegate to implementation
        _claimYieldRewards(_staker, _useSILV);
    }

    /**
     * @notice this function can be called only by ILV core pool
     *
     * @dev uses ILV pool as a router by receiving the _staker address and executing
     *      the internal _claimVaultRewards()
     * @dev its usage allows claiming multiple pool contracts in one transaction
     *
     * @param _staker user address
     */
    function claimVaultRewardsFromRouter(address _staker) external virtual updatePool {
        // check contract is not paused
        _requireNotPaused(SushiLPPool(this).claimVaultRewardsFromRouter.selector);
        // verify is being called by ILV pool
        _requireSenderIsIlvPool(SushiLPPool(this).claimVaultRewardsFromRouter.selector);

        // delegate to implementation
        _claimVaultRewards(_staker);
    }

    /// @dev checks if caller is ILVPool
    function _requireSenderIsIlvPool(bytes4 fnSelector) internal view {
        // verify if tx sender is an ILV pool
        fnSelector.verifyAccess(address(factory.pools(ilv)) == msg.sender);
    }
}
