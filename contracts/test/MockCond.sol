// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.5.0;

import "../interfaces/ICrocCondOracle.sol";

contract MockCrocNonceOracle is ICrocNonceOracle,
    ICrocCondOracle{

    address public user_;
    bytes32 public salt_;
    uint32 public nonce_;
    bytes public args_;
    bool public accept_;

    function setAccept (bool accept) public {
        accept_ = accept;
    }

    function checkCrocNonceSet (address user, bytes32 nonceSalt, uint32 nonce,
                                bytes calldata args) public override returns (bool) {
        user_ = user;
        salt_ = nonceSalt;
        nonce_ = nonce;
        args_ = args;
        return accept_;
    }

    function checkCrocCond (address user, 
                            bytes calldata args) public override returns (bool) {
        user_ = user;
        args_ = args;
        return accept_;
    }

}

