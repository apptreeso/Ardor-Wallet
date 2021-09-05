// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { IFactory } from "./interfaces/IFactory.sol";
import { ICorePool } from "./interfaces/ICorePool.sol";
import { CorePool } from "./base/CorePool.sol";

contract ILVPool is CorePool {
    event LogClaimRewardsMultiple(address indexed from, address[] pools, bool[] useSILV);

    /// @dev see __ICorePool_init
    function __ILVPool_init(
        address _ilv,
        address _silv,
        address _poolToken,
        address _factory,
        uint64 _initTime,
        uint32 _weight
    ) internal initializer {
        __CorePool_init(_ilv, _silv, _poolToken, _factory, _initTime, _weight);
    }

    /**
     * @dev calls multiple pools claimRewardsFromRouter() in order to claim yield
     * in 1 transaction.
     *
     * @notice ILV pool works as a router for claiming multiple pools registered
     *         in the factory
     *
     * @param _pools array of pool addresses
     * @param _useSILV array of bool values telling if the pool should claim reward
     *                 as ILV or sILV
     */
    function claimRewardsMultiple(address[] calldata _pools, bool[] calldata _useSILV) external {
        require(_pools.length == _useSILV.length, "invalid parameters");
        for (uint256 i = 0; i < _pools.length; i++) {
            address pool = _pools[i];
            require(IFactory(factory).poolExists(pool), "invalid pool");

            if (ICorePool(pool).poolToken() == ilv) {
                _claimRewards(msg.sender, _useSILV[i]);
            } else {
                ICorePool(pool).claimRewardsFromRouter(msg.sender, _useSILV[i]);
            }
        }

        emit LogClaimRewardsMultiple(msg.sender, _pools, _useSILV);
    }

    /// @notice not necessary for ILV pool because we claim internally in claimRewardsMultiple()
    function claimRewardsFromRouter(address _staker, bool _useSILV) external override {}
}
