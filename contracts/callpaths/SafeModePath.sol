// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './ColdPath.sol';

contract SafeModePath is ColdPath {

    function protocolCmd (bytes calldata cmd) override public {
        sudoCmd(cmd);
    }

    function userCmd (bytes calldata) override public payable {
        revert("Emergency Mode");
    }
}

