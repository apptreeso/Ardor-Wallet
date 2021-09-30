// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import { ICorePoolV1 } from "../interfaces/ICorePoolV1.sol";

contract CorePoolV1Mock is ICorePoolV1 {
    struct UserParameter {
        address userAddress;
        V1Stake[] deposits;
    }

    uint256 public override usersLockingWeight;

    mapping(address => V1Stake[]) public users;

    function setUsers(UserParameter[] calldata _userParameter) external {
        for (uint256 i = 0; i < _userParameter.length; i++) {
            address user = _userParameter[i].userAddress;
            for (uint256 j = 0; j < _userParameter[i].deposits.length; j++) {
                users[user].push(_userParameter[i].deposits[j]);
            }
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
        V1Stake storage deposit = users[_from][_stakeId];

        return (deposit.tokenAmount, deposit.weight, deposit.lockedFrom, deposit.lockedUntil, deposit.isYield);
    }
}
