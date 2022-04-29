// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.5.0;

import "../interfaces/ICrocMinion.sol";

contract MockMinion is ICrocMinion {

    bytes[] public userCmds_;
    bytes[] public protoCmds_;
    uint16[] public paths_;
    address[] public callers_;
    bool[] public sudos_;

    function protocolCmd (uint16 proxyPath, bytes calldata cmd, bool sudo) public payable
        override returns (bytes memory) {
        paths_.push(proxyPath);
        protoCmds_.push(cmd);
        callers_.push(tx.origin);
        sudos_.push(sudo);
        return abi.encode();
    }

    function userCmd (uint16 proxyPath, bytes calldata cmd) public payable returns
        (bytes memory) {
        paths_.push(proxyPath);
        userCmds_.push(cmd);
        callers_.push(tx.origin);
        return abi.encode();
    }
}
