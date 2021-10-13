// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.5.0;

import "../interfaces/ICrocSwapPermitOracle.sol";

contract MockPermit is ICrocSwapPermitOracle {

    address public user_;
    address public base_;
    address public quote_;
    uint256 public code_;
    bool public passThru_;

    function setMatching (address user, address base, address quote,
                          uint8 tradeCode) public {
        user_ = user;
        base_ = base;
        quote_ = quote;
        code_ = tradeCode;
    }

    function setPassThru (bool passThru) public {
        passThru_ = passThru;
    }
        
    
    function isApprovedForCrocPool (address nUser, address nBase, address nQuote,
                                    uint8 tradeCode)
        public view override returns (bool) {
        if (passThru_) { return true; }
        return nUser == user_ &&
            nBase == base_ &&
            nQuote == quote_ &&
            code_ == tradeCode;
    }
}
