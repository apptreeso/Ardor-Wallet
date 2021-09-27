// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import { ICorePoolV1 } from "../interfaces/ICorePoolV1.sol";

contract CorePoolV1Mock is ICorePoolV1 {
    uint256 public override usersLockingWeight;

    mapping(address => V1User) public users;

    constructor(address[] memory _userAddresses, V1User[] memory _userData) {
        require(_userAddresses.length == _userData.length, "invalid parameters");
        for (uint256 i = 0; i < _userAddresses.length; i++) {
            users[_userAddresses[i]] = _userData[i];
        }
    }

    function setUsers(address[] memory _userAddresses, V1User[] memory _userData) external {
        require(_userAddresses.length == _userData.length, "invalid parameters");
        for (uint256 i = 0; i < _userAddresses.length; i++) {
            users[_userAddresses[i]] = _userData[i];
        }
    }

    function getDeposit(address _from, uint256 _stakeId)
        external
        view
        override
        returns (
            uint256,
            uint256,
            uint64,
            uint64,
            bool
        )
    {
        V1Stake storage deposit = users[_from].deposits[_stakeId];

        return (deposit.tokenAmount, deposit.weight, deposit.lockedFrom, deposit.lockedUntil, deposit.isYield);
    }
}
