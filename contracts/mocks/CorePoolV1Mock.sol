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

    mapping(address => V1Stake[]) public mockedUsers;

    constructor(address _poolToken) {
        require(_poolToken != address(0));

        poolToken = _poolToken;
    }

    /**
     * @dev Mocks V1 user mapping functionality, by returning some total weight
     *      if the mocked user has any stake.
     */
    function users(address _who)
        external
        view
        virtual
        override
        returns (
            uint256 tokenAmount,
            uint256 totalWeight,
            uint256 subYieldRewards,
            uint256 subVaultRewards
        )
    {
        // mocks some total weight
        if (mockedUsers[_who].length > 0) {
            totalWeight = 100;
        }
    }

    function setUsers(UserParameter[] calldata _userParameter) external {
        for (uint256 i = 0; i < _userParameter.length; i++) {
            address user = _userParameter[i].userAddress;
            for (uint256 j = 0; j < _userParameter[i].deposits.length; j++) {
                mockedUsers[user].push(_userParameter[i].deposits[j]);
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
        usersLockingWeight = usersLockingWeight - mockedUsers[_user][_stakeId].weight + _newWeight;
        mockedUsers[_user][_stakeId].weight = _newWeight;
    }

    function changeStakeValue(
        address _user,
        uint256 _stakeId,
        uint256 _newValue
    ) external {
        poolTokenReserve = poolTokenReserve - mockedUsers[_user][_stakeId].tokenAmount + _newValue;
        mockedUsers[_user][_stakeId].tokenAmount = _newValue;
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
        V1Stake storage deposit = mockedUsers[_from][_stakeId];

        return (deposit.tokenAmount, deposit.weight, deposit.lockedFrom, deposit.lockedUntil, deposit.isYield);
    }
}
