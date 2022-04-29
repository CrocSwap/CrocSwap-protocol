// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.5.0;

import "../interfaces/ICrocVirtualToken.sol";

contract MockVirtualToken is ICrocVirtualToken {

    bool accept_;

    address public user_;
    uint256 public tokenSalt_;
    uint128 public value_;
    bytes public args_;

    function setAccept (bool accept) public {
        accept_ = accept;
    }

    function depositCroc (address user, uint256 tokenSalt, uint128 value,
                          bytes calldata args) public override returns (bool) {
        user_ = user;
        tokenSalt_ = tokenSalt;
        value_ = value;
        args_ = args;
        return accept_;
    }

    function withdrawCroc (address user, uint256 tokenSalt, uint128 value,
                           bytes calldata args) public override returns (bool) {
        user_ = user;
        tokenSalt_ = tokenSalt;
        value_ = value;
        args_ = args;
        return accept_;
    }
}
