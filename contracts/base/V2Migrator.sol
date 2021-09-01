// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { ICorePoolV1 } from "../interfaces/ICorePoolV1.sol";
import { Stake } from "../libraries/Stake.sol";
import { CorePool } from "./CorePool.sol";

abstract contract V2Migrator is CorePool {
    /// @dev address of v1 core pool with same poolToken
    address public corePoolV1;

    /// @dev maps `keccak256(userAddress,stakeId)` to a bool value that tells
    ///      if a v1 yield has already been minted by v2 contract
    mapping(bytes32 => bool) public v1YieldMinted;
    /// @dev maps `keccak256(userAddress,stakeId)` to a bool value that tells
    ///      if a v1 locked stake has already been migrated to v2
    mapping(bytes32 => bool) public v1StakesMigrated;

    /**
     * @dev logs mintV1Yield()
     *
     * @param from user address
     * @param stakeId v1 yield id
     * @param value number of ILV tokens minted
     *
     */
    event LogV1YieldMinted(address indexed from, uint256 stakeId, uint256 value);

    /**
     * @dev logs migrateLockedStake()
     *
     * @param from user address
     * @param stakeIds array of locked stakes ids
     *
     */
    event LogMigrateLockedStake(address indexed from, uint256[] stakeIds);

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
     * @dev reads v1 core pool yield data (using `_stakeId` and `msg.sender`),
     *      validates, mints ILV according to v1 data and stores a receipt hash
     *
     * @param _stakeId v1 yield id
     */
    function mintV1Yield(uint256 _stakeId) external {
        (uint256 tokenAmount, , , uint64 lockedUntil, bool isYield) = ICorePoolV1(corePoolV1).getStake(
            msg.sender,
            _stakeId
        );
        require(isYield, "not yield");
        require(_now256() > lockedUntil, "yield not unlocked yet");
        bytes32 stakeHash = keccak256(abi.encodePacked(msg.sender, _stakeId));
        require(!v1YieldMinted[stakeHash], "yield already minted");

        v1YieldMinted[stakeHash] = true;
        factory.mintYieldTo(msg.sender, tokenAmount, false);

        emit LogV1YieldMinted(msg.sender, _stakeId, tokenAmount);
    }

    /**
     * @dev reads v1 core pool locked stakes data (by looping through the `_stakeIds` array),
     *      checks if it's a valid v1 stake to migrate and save the id to v2 user struct
     *
     * @notice only `msg.sender` can migrate v1 stakes to v2
     *
     * @param _stakeIds array of v1 stake ids
     */
    function migrateLockedStake(uint256[] calldata _stakeIds) external {
        User storage user = users[msg.sender];

        for (uint256 i = 0; i < _stakeIds.length; i++) {
            (, uint256 lockedFrom, , bool isYield) = ICorePoolV1(corePoolV1).getDeposit(msg.sender, _stakeIds[i]);
            require(lockedFrom > 0 && isYield, "invalid stake to migrate");
            bytes32 stakeHash = keccak256(abi.encodePacked(msg.sender, _stakeIds[i]));
            require(!v1StakesMigrated[stakeHash], "stake id already migrated");

            v1StakesMigrated[stakeHash] = true;
            user.v1StakesIds.push(_stakeIds[i]);
        }

        emit LogMigrateLockedStake(msg.sender, _stakeIds);
    }
}
