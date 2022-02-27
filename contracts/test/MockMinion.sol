// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.5.0;

import "../interfaces/ICrocMinion.sol";

contract MockMinion is ICrocMinion {

    bytes[] public cmds_;
    uint8[] public paths_;
    address[] public callers_;

    function protocolCmd (uint8 proxyPath, bytes calldata cmd) public payable override {
        paths_.push(proxyPath);
        cmds_.push(cmd);
        callers_.push(tx.origin);
    }

    function userCmd (uint8, bytes calldata) public payable override { }
}
