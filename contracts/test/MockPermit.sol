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
        

     function checkApprovedForCrocPool (address user, address base, address quote,
                                        Directives.AmbientDirective calldata ambient,
                                        Directives.SwapDirective calldata swap,
                                        Directives.ConcentratedDirective[] calldata concs)
         external override returns (bool) {
         if (passThru_) { return true; }
         return true;
     }

     function checkApprovedForCrocSwap (address user, address base, address quote,
                                        bool isBuy, bool inBaseQty, uint128 qty)
         external override returns (bool) {
         if (passThru_) { return true; }
         return true;
     }

     function checkApprovedForCrocMint (address user, address base, address quote,
                                        int24 bidTick, int24 askTick, uint128 liq)
         external override returns (bool) {
         if (passThru_) { return true; }
         return true;
     }

     function checkApprovedForCrocBurn (address user, address base, address quote,
                                       int24 bidTick, int24 askTick, uint128 liq)
         external override view returns (bool) {
         if (passThru_) { return true; }
         return true;
     }
}
