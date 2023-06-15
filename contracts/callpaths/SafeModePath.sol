// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

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

    /* @notice Used at upgrade time to verify that the contract is a valid Croc sidecar proxy and used
     *         in the correct slot. */
    function acceptCrocProxyRole (address, uint16 slot) public pure override returns (bool) {
        return slot == CrocSlots.SAFE_MODE_PROXY_PATH;
    }
}

