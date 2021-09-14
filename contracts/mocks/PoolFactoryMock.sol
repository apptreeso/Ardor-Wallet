// SPDX-License-Identifier: MIT

pragma solidity 0.8.4;

import { PoolFactory } from "../PoolFactory.sol";

contract PoolFactoryMock is PoolFactory {
    uint256 public now256;

    function initialize(
        address _ilv,
        address _silv,
        uint192 _ilvPerSecond,
        uint32 _secondsPerUpdate,
        uint32 _initTime,
        uint32 _endTime
    ) external override initializer {
        // verify the inputs are set
        require(_silv != address(0), "sILV address not set");
        require(_ilvPerSecond > 0, "ILV/second not set");
        require(_secondsPerUpdate > 0, "seconds/update not set");
        require(_initTime > 0, "init seconds not set");
        require(_endTime > _initTime, "invalid end time: must be greater than init time");

        __Ownable_init();

        // save the inputs into internal state variables
        ilv = _ilv;
        silv = _silv;
        ilvPerSecond = _ilvPerSecond;
        secondsPerUpdate = _secondsPerUpdate;
        lastRatioUpdate = _initTime;
        endTime = _endTime;
    }

    function setNow256(uint256 __now256) external {
        now256 = __now256;
    }

    function _now256() internal view override returns (uint256) {
        return now256;
    }
}
