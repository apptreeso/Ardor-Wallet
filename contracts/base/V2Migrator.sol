// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { ICorePoolV1 } from "../interfaces/ICorePoolV1.sol";
import { PoolBase } from "./PoolBase.sol";

abstract contract V2Migrator is PoolBase {
    struct MigratedUser {
        address user;
        MigratedStake[] v1Stakes;
        uint256 totalWeight;
    }

    address public corePoolV1;

    mapping(bytes32 => bool) public v1YieldMinted;

    event LogV1YieldMinted(address indexed _from, uint256 _depositId, uint256 _value);

    function __V2Migrator_init(address _corePoolV1) internal initializer {
        corePoolV1 = _corePoolV1;
    }

    function mintV1Yield(uint256 _depositId) external {
        (uint256 tokenAmount, , , uint64 lockedUntil, bool isYield) = ICorePoolV1(corePoolV1).getDeposit(
            msg.sender,
            _depositId
        );
        require(isYield, "not yield");
        require(_now256() > lockedUntil, "yield not unlocked yet");
        bytes32 depositHash = keccak256(abi.encodePacked(msg.sender, _depositId));
        require(!v1YieldMinted[depositHash], "yield already minted");

        v1YieldMinted[depositHash] = true;
        factory.mintYieldTo(msg.sender, tokenAmount, false);

        emit LogV1YieldMinted(msg.sender, _depositId, tokenAmount);
    }

    function migrateLockedStakeFull(MigratedUser[] calldata _users) external onlyFactoryController {
        for (uint256 i = 0; i < _users.length; i++) {
            users[_users[i].user].totalWeight += _users[i].totalWeight;
            users[_users[i].user].v1Stakes = _users[i].v1Stakes;
        }
    }

    function migrateLockedStakePartial(MigratedUser[] calldata _users) external onlyFactoryController {
        for (uint256 i = 0; i < _users.length; i++) {
            users[_users[i].user].v1Stakes = _users[i].v1Stakes;
        }
    }
}
