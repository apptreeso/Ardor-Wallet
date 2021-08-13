// SPDX-License-Identifier: MIT
pragma solidity 0.8.0;

interface IFactory {
    function mintYieldTo(
        address _to,
        uint256 _amount,
        bool _useSILV
    ) external;
}
