// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import { ICorePoolV1 } from "../interfaces/ICorePoolV1.sol";

contract CorePoolV1Mock is ICorePoolV1 {
    struct UserParameter {
        address userAddress;
        V1Stake[] deposits;
    }

    address public override poolToken;
    uint256 public override usersLockingWeight;
    uint256 public override poolTokenReserve;

    mapping(address => V1Stake[]) public users;

    constructor(address _poolToken) {
        require(_poolToken != address(0));

        poolToken = _poolToken;
    }

    function setUsers(UserParameter[] calldata _userParameter) external {
        for (uint256 i = 0; i < _userParameter.length; i++) {
            address user = _userParameter[i].userAddress;
            for (uint256 j = 0; j < _userParameter[i].deposits.length; j++) {
                users[user].push(_userParameter[i].deposits[j]);
                usersLockingWeight += _userParameter[i].deposits[j].weight;
                poolTokenReserve += _userParameter[i].deposits[j].tokenAmount;
            }
        }
    }

    function changeStakeWeight(
        address _user,
        uint256 _stakeId,
        uint256 _newWeight
    ) external {
        usersLockingWeight = usersLockingWeight - users[_user][_stakeId].weight + _newWeight;
        users[_user][_stakeId].weight = _newWeight;
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
