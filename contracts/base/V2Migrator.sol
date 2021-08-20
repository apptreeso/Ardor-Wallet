// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import { ICorePoolV1 } from "../interfaces/ICorePoolV1.sol";
import { PoolBase } from "./PoolBase.sol";

abstract contract V2Migrator is PoolBase {
    address public immutable corePoolV1;

    mapping(bytes32 => bool) public v1YieldMinted;

    event LogV1YieldMinted(address indexed _from, uint256 _depositId, uint256 _value);

    constructor(address _corePoolV1) {
        corePoolV1 = _corePoolV1;
    }

    function mintV1Yield(uint256 _depositId) external {
        (uint256 tokenAmount, uint256 weight, uint64 lockedFrom, uint64 lockedUntil, bool isYield) = ICorePoolV1(
            corePoolV1
        ).getDeposit(msg.sender, _depositId);
        require(isYield, "not yield");
        require(_now256() > lockedUntil, "yield not unlocked yet");
        bytes32 depositHash = keccak256(abi.encodePacked(msg.sender, _depositId));
        require(!v1YieldMinted[depositHash], "yield already minted");

        v1YieldMinted[depositHash] = true;
        factory.mintYieldTo(msg.sender, tokenAmount, false);

        emit LogV1YieldMinted(msg.sender, _depositId, tokenAmount);
    }
}
