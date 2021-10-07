// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

interface ICorePoolV1 {
    struct V1Stake {
        // @dev token amount staked
        uint256 tokenAmount;
        // @dev stake weight
        uint256 weight;
        // @dev locking period - from
        uint64 lockedFrom;
        // @dev locking period - until
        uint64 lockedUntil;
        // @dev indicates if the stake was created as a yield reward
        bool isYield;
    }

    function getDeposit(address _from, uint256 _stakeId)
        external
        view
        returns (
            uint256,
            uint256,
            uint64,
            uint64,
            bool
        );

    function poolToken() external view returns (address);

    function usersLockingWeight() external view returns (uint256);

    function poolTokenReserve() external view returns (uint256);
}
