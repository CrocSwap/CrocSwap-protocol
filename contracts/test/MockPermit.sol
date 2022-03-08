// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.5.0;

import "../interfaces/ICrocPermitOracle.sol";

contract MockPermit is ICrocPermitOracle {

    address public user_;
    address public base_;
    address public quote_;
    address public sender_;
    bool public passThru_;

    bool public isBuySnap_;
    bool public inBaseQtySnap_;
    uint128 public qtySnap_;
    int24 public bidTickSnap_;
    int24 public askTickSnap_;
    uint128 public liqSnap_;
    uint8 public codeSnap_;
    uint16 public poolFee_;
    uint256 public poolIdx_;
    
    function setMatching (address user, address base, address quote) public {
        user_ = user;
        base_ = base;
        quote_ = quote;
    }

    function setPassThru (bool passThru) public {
        passThru_ = passThru;
    }
        

    function checkApprovedForCrocPool (address user, address sender,
                                       address base, address quote,
                                       Directives.AmbientDirective calldata,
                                       Directives.SwapDirective calldata,
                                       Directives.ConcentratedDirective[] calldata,
                                       uint16 poolFee)
        external override returns (uint16 discount) {
        if (passThru_) { return 1; }
        codeSnap_ = 1;
        sender_ = sender;
        poolFee_ = poolFee;
        discount = (user == user_ && base == base_ && quote_ == quote) ? 1 : 0;
     }

    function checkApprovedForCrocSwap (address user, address sender,
                                       address base, address quote,
                                       bool isBuy, bool inBaseQty, uint128 qty,
                                       uint16 poolFee)
        external override returns (uint16 discount) {
        if (passThru_) { return 1; }
        sender_ = sender;
        codeSnap_ = 2;
        isBuySnap_ = isBuy;
        inBaseQtySnap_ = inBaseQty;
        qtySnap_ = qty;
        poolFee_ = poolFee;
        discount = (user == user_ && base == base_ && quote_ == quote) ? 1 : 0;
    }

    function checkApprovedForCrocMint (address user, address sender,
                                       address base, address quote,
                                       int24 bidTick, int24 askTick, uint128 liq)
         external override returns (bool) {
         if (passThru_) { return true; }
         codeSnap_ = 3;
         sender_ = sender;
         bidTickSnap_ = bidTick;
         askTickSnap_ = askTick;
         liqSnap_ = liq;
         return user == user_ && base == base_ && quote_ == quote;
     }

    function checkApprovedForCrocBurn (address user, address sender,
                                       address base, address quote,
                                       int24 bidTick, int24 askTick, uint128 liq)
         external override returns (bool) {
         if (passThru_) { return true; }
         sender_ = sender;
         bidTickSnap_ = bidTick;
         askTickSnap_ = askTick;
         liqSnap_ = liq;
         codeSnap_ = 4;                 
         return user == user_ && base == base_ && quote_ == quote;
     }

    function checkApprovedForCrocInit (address user, address sender,
                                       address base, address quote, uint256 poolIdx)
         external override returns (bool) {
         if (passThru_) { return true; }
         sender_ = sender;
         codeSnap_ = 5;
         poolIdx_ = poolIdx;
         return user == user_ && base == base_ && quote_ == quote;
     }
}

