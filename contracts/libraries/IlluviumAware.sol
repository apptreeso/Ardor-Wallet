// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

/**
 * @title Illuvium Aware
 *
 * @notice Helper library be used by other smart contracts requiring to
 *      be linked to verified ILV and sILV ERC20 instances.
 *
 */
library IlluviumAware {
    address public constant ILV = 0x767FE9EDC9E0dF98E07454847909b5E959D7ca0E;
    address public constant SILV = 0x398AeA1c9ceb7dE800284bb399A15e0Efe5A9EC2;

    /**
     * @dev Verifies if correct ILV token address is being supplied.
     *
     * @param _ilv deployed ILV ERC20 instance address
     */
    function verifyILV(address _ilv) internal pure {
        // verify ILV address is correct
        require(_ilv == ILV, "wrong ILV address");
    }

    /**
     * @dev Verifies if correct sILV token address is being supplied.
     *
     * @param _silv deployed sILV ERC20 instance address
     */
    function verifySILV(address _silv) internal pure {
        // verify sILV address is correct
        require(_silv == SILV, "wrong sILV address");
    }
}
