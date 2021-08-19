// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

import { ICorePoolV1 } from "../interfaces/ICorePoolV1.sol";
import { PoolBase } from "./PoolBase.sol";

abstract contract V2Migrator is PoolBase {
    address public immutable corePoolV1;

    mapping()

    event LogV1YieldMinted(address indexed _from, uint256 _depositId, uint256 _value);

    constructor(address _corePoolV1) {
        corePoolV1 = _corePoolV1;
    }

    function mintV1Yield(uint256 _depositId) external {
        V1Stake memory v1Stake = ICorePoolV1(corePoolV1).getDeposit(msg.sender, _depositId);
        require(v1Stake.isYield, "not yield");
        require(_now256() > v1Stake.lockedUntil, "yield not unlocked yet");
        require(v1Mints)

        v1Mints[msg.sender].push(_depositId);
        factory.mintYieldTo(msg.sender, v1Stake.tokenAmount, false);

        emit LogV1YieldMinted(msg.sender, _depositId, v1Stake.tokenAmount);
    }
}
