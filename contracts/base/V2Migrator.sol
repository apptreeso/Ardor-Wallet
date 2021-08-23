// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { ICorePoolV1 } from "../interfaces/ICorePoolV1.sol";
import { PoolBase } from "./PoolBase.sol";

abstract contract V2Migrator is PoolBase {
    struct MigratedUser {
        /// @dev v1 user address
        address user;
        /// @dev array of v1 stakes
        MigratedStake[] v1Stakes;
        /// @dev total locked weight being migrated
        uint256 totalWeight;
    }

    /// @dev address of v1 core pool with same poolToken
    address public corePoolV1;

    /// @dev maps `keccak256(user,depositId)` to a bool value that tells
    /// if a v1 yield has already been minted by v2 contract
    mapping(bytes32 => bool) public v1YieldMinted;

    /**
     * @dev logs `mintV1Yield`
     *
     * @param _from user address
     * @param _depositId v1 yield id
     * @param _value number of ILV tokens minted
     *
     */
    event LogV1YieldMinted(address indexed _from, uint256 _depositId, uint256 _value);

    /**
     * @dev V2Migrator initializer function
     *
     * @param _corePoolV1 v1 core pool address
     *
     */
    function __V2Migrator_init(address _corePoolV1) internal initializer {
        corePoolV1 = _corePoolV1;
    }

    /**
     * @dev reads v1 core pool yield data (using `_depositId` and `msg.sender`),
     * validates, mints ILV according to v1 data and stores a receipt hash
     *
     * @param _depositId v1 yield id
     */
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

    /// TODO: check migration strategy to be used
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
