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
    Directives.ConcentratedDirective public bookend;
    
    uint256 public poolIdx;
    int24 public openTick;
    
    
    function testEncodeHop (uint8 idx, bytes calldata input) public {
        Directives.OrderDirective memory directive = OrderEncoding.decodeOrder(input);
        settleHop = directive.hops_[idx].settle_;
        priceImprove = directive.hops_[idx].improve_;
    }

    function testEncodePool (uint8 pairPos, uint8 poolPos,
                             bytes calldata input) public {
        Directives.OrderDirective memory dir = OrderEncoding.decodeOrder(input);
        poolIdx = dir.hops_[pairPos].pools_[poolPos].poolIdx_;
        swap = dir.hops_[pairPos].pools_[poolPos].swap_;
        ambientOpen = dir.hops_[pairPos].pools_[poolPos].ambient_;
        chaining = dir.hops_[pairPos].pools_[poolPos].chain_;
    }

    function testEncodePassive (uint8 pairPos, uint8 poolPos, uint8 concPos,
                                bytes calldata input) public {
        Directives.OrderDirective memory dir = OrderEncoding.decodeOrder(input);
        bookend = dir.hops_[pairPos].pools_[poolPos].conc_[concPos];
    }

    function testEncodeOpen (bytes calldata input) public {
        Directives.OrderDirective memory directive = OrderEncoding.decodeOrder(input);
        settleOpen = directive.open_;        
    }
}
