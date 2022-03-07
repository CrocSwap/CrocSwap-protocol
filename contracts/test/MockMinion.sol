// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.5.0;

import "../interfaces/ICrocMinion.sol";

contract MockMinion is ICrocMinion {

    bytes[] public cmds_;
    uint16[] public paths_;
    address[] public callers_;

    function protocolCmd (uint16 proxyPath, bytes calldata cmd) public payable
        override returns (bytes memory) {
        paths_.push(proxyPath);
        cmds_.push(cmd);
        callers_.push(tx.origin);
        return abi.encode();
    }

    function sudoCmd (uint16 proxyPath, bytes calldata cmd) public payable
        override returns (bytes memory) {
        paths_.push(proxyPath);
        cmds_.push(cmd);
        callers_.push(tx.origin);
        return abi.encode();
    }

    function userCmd (uint16, bytes calldata) public payable override returns
        (bytes memory) {
        return abi.encode();
    }
}
