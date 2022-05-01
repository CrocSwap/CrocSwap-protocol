// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './ColdPath.sol';

/* @title Safe Mode Call Path.
 *
 * @notice Highly restricted callpath meant to be the sole point of entry when the dex
 *         contract has been forced into emergency safe mode. Essentially this retricts 
 *         all calls besides sudo mode admin actions. */
contract SafeModePath is ColdPath {

    function protocolCmd (bytes calldata cmd) override public {
        sudoCmd(cmd);
    }

    function userCmd (bytes calldata) override public payable {
        revert("Emergency Safe Mode");
    }
}

