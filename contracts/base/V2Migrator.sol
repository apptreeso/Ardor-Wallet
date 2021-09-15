// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { ICorePoolV1 } from "../interfaces/ICorePoolV1.sol";
import { Stake } from "../libraries/Stake.sol";
import { CorePool } from "./CorePool.sol";

abstract contract V2Migrator is CorePool {
    /// @dev maps `keccak256(userAddress,stakeId)` to a bool value that tells
    ///      if a v1 yield has already been minted by v2 contract
    mapping(address => mapping(uint256 => bool)) public v1YieldMinted;
    /// @dev maps `keccak256(userAddress,stakeId)` to a bool value that tells
    ///      if a v1 locked stake has already been migrated to v2
    mapping(address => mapping(uint256 => bool)) public v1StakesMigrated;

    /// @dev stores maximum timestamp of a v1 stake accepted in v2
    uint256 public v1StakeMaxPeriod;

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
     * @dev logs mintV1Yield()
     *
     * @param from user address
     * @param stakeIds array of v1 yield ids
     * @param value number of ILV tokens minted
     *
     */
    event LogV1YieldMintedMultiple(address indexed from, uint256[] stakeIds, uint256 value);

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
    function __V2Migrator_init(
        address _ilv,
        address _silv,
        address _poolToken,
        address _factory,
        uint64 _initTime,
        uint32 _weight,
        address _corePoolV1,
        uint256 _v1StakeMaxPeriod
    ) internal initializer {
        __CorePool_init(_ilv, _silv, _poolToken, _factory, _initTime, _weight);

        corePoolV1 = _corePoolV1;
        v1StakeMaxPeriod = _v1StakeMaxPeriod;
    }

    /**
     * @dev reads v1 core pool yield data (using `_stakeId` and `msg.sender`),
     *      validates, mints ILV according to v1 data and stores a receipt hash
     *
     * @param _stakeId v1 yield id
     */
    function mintV1Yield(uint256 _stakeId) external {
        (uint256 tokenAmount, uint256 weight, , uint64 lockedUntil, bool isYield) = ICorePoolV1(corePoolV1).getDeposit(
            msg.sender,
            _stakeId
        );
        require(isYield, "not a yield");
        require(_now256() > lockedUntil, "not yet unlocked");
        require(!v1YieldMinted[msg.sender][_stakeId], "already minted");

        users[msg.sender].totalWeight -= uint248(weight);
        v1YieldMinted[msg.sender][_stakeId] = true;
        factory.mintYieldTo(msg.sender, tokenAmount, false);

        emit LogV1YieldMinted(msg.sender, _stakeId, tokenAmount);
    }

    function mintV1YieldMultiple(uint256[] calldata _stakeIds) external {
        uint256 amountToMint;

        for (uint256 i = 0; i < _stakeIds.length; i++) {
            uint256 _stakeId = _stakeIds[i];
            (uint256 tokenAmount, , , uint64 lockedUntil, bool isYield) = ICorePoolV1(corePoolV1).getDeposit(
                msg.sender,
                _stakeId
            );
            require(isYield, "not a yield");
            require(_now256() > lockedUntil, "not yet unlocked");
            require(!v1YieldMinted[msg.sender][_stakeId], "already minted");

            v1YieldMinted[msg.sender][_stakeId] = true;
            amountToMint += tokenAmount;
        }

        factory.mintYieldTo(msg.sender, amountToMint, false);

        emit LogV1YieldMintedMultiple(msg.sender, _stakeIds, amountToMint);
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

        // gas savings
        uint256 _v1StakeMaxPeriod = v1StakeMaxPeriod;

        for (uint256 i = 0; i < _stakeIds.length; i++) {
            (, uint256 lockedFrom, , , bool isYield) = ICorePoolV1(corePoolV1).getDeposit(msg.sender, _stakeIds[i]);
            require(lockedFrom <= _v1StakeMaxPeriod, "stake created after max period");
            require(lockedFrom > 0 && isYield, "invalid stake");
            require(!v1StakesMigrated[msg.sender][_stakeIds[i]], "already migrated");

            v1StakesMigrated[msg.sender][_stakeIds[i]] = true;
            user.v1IdsLength++;
            user.v1StakesIds[i] = _stakeIds[i];
        }

        emit LogMigrateLockedStake(msg.sender, _stakeIds);
    }
}
