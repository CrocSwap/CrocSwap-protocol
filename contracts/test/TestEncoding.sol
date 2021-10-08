// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../libraries/Encoding.sol";
import "../libraries/Directives.sol";

contract TestEncoding {
    Directives.SettlementChannel public settleOpen;
    Directives.SettlementChannel public settleHop;
    Directives.PriceImproveReq public priceImprove;
    Directives.ChainingFlags public chaining;
    Directives.SwapDirective public swap;
    Directives.AmbientDirective public ambientOpen;
    Directives.ConcenBookend public bookend;
    
    uint24 public poolIdx;
    int24 public openTick;
    
    
    function testEncodeHop (uint8 idx, bytes calldata input) public {
        Directives.OrderDirective memory directive = OrderEncoding.decodeOrder(input);
        settleHop = directive.hops_[idx].settle_;
        priceImprove = directive.hops_[idx].improve_;
        chaining = directive.hops_[idx].chain_;
    }

    function testEncodePool (uint8 pairPos, uint8 poolPos,
                             bytes calldata input) public {
        Directives.OrderDirective memory dir = OrderEncoding.decodeOrder(input);
        poolIdx = dir.hops_[pairPos].pools_[poolPos].poolIdx_;
        swap = dir.hops_[pairPos].pools_[poolPos].swap_;
        ambientOpen = dir.hops_[pairPos].pools_[poolPos].ambient_;
    }

    function testEncodePassive (uint8 pairPos, uint8 poolPos, uint8 concPos,
                                uint8 bookendPos, bytes calldata input) public {
        Directives.OrderDirective memory dir = OrderEncoding.decodeOrder(input);
        openTick = dir.hops_[pairPos].pools_[poolPos]
            .conc_[concPos].openTick_;
        bookend = dir.hops_[pairPos].pools_[poolPos]
            .conc_[concPos].bookends_[bookendPos];
    }

    function testEncodeOpen (bytes calldata input) public {
        Directives.OrderDirective memory directive = OrderEncoding.decodeOrder(input);
        settleOpen = directive.open_;        
    }
}
