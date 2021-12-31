// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.5.0;

import "../interfaces/ICrocMinion.sol";

contract MockMinion is ICrocMinion {

    bytes[] public cmds_;
    address[] public callers_;

    function protocolCmd (bytes calldata cmd) public override {
        cmds_.push(cmd);
        callers_.push(tx.origin);
    }
}
