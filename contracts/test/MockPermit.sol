// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.5.0;

import "../interfaces/ICrocSwapPermitOracle.sol";

contract MockPermit is ICrocSwapPermitOracle {

    address public user_;
    address public base_;
    address public quote_;
    bool public passThru_;

    bool public isBuySnap_;
    bool public inBaseQtySnap_;
    uint128 public qtySnap_;
    int24 public bidTickSnap_;
    int24 public askTickSnap_;
    uint128 public liqSnap_;
    uint8 public codeSnap_;
    
    function setMatching (address user, address base, address quote) public {
        user_ = user;
        base_ = base;
        quote_ = quote;
    }

    function setPassThru (bool passThru) public {
        passThru_ = passThru;
    }
        

     function checkApprovedForCrocPool (address user, address base, address quote,
                                        Directives.AmbientDirective calldata,
                                        Directives.SwapDirective calldata,
                                        Directives.ConcentratedDirective[] calldata)
         external override returns (bool) {
         if (passThru_) { return true; }
         codeSnap_ = 1;
         return user == user_ && base == base_ && quote_ == quote;
     }

     function checkApprovedForCrocSwap (address user, address base, address quote,
                                        bool isBuy, bool inBaseQty, uint128 qty)
         external override returns (bool) {
         if (passThru_) { return true; }
         codeSnap_ = 2;
         isBuySnap_ = isBuy;
         inBaseQtySnap_ = inBaseQty;
         qtySnap_ = qty;
         return user == user_ && base == base_ && quote_ == quote;
     }

     function checkApprovedForCrocMint (address user, address base, address quote,
                                        int24 bidTick, int24 askTick, uint128 liq)
         external override returns (bool) {
         if (passThru_) { return true; }
         codeSnap_ = 3;
         bidTickSnap_ = bidTick;
         askTickSnap_ = askTick;
         liqSnap_ = liq;
         return user == user_ && base == base_ && quote_ == quote;
     }

     function checkApprovedForCrocBurn (address user, address base, address quote,
                                        int24 bidTick, int24 askTick, uint128 liq)
         external override returns (bool) {
         if (passThru_) { return true; }
         bidTickSnap_ = bidTick;
         askTickSnap_ = askTick;
         liqSnap_ = liq;
         codeSnap_ = 4;                 
         return user == user_ && base == base_ && quote_ == quote;
     }
}
