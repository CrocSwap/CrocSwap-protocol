// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../libraries/PriceImprove.sol";

contract TestPriceImprove {

    function testThresh (bool inBase, uint128 unit, uint16 awayTicks,
                         int8[] calldata mults, uint16 tickSize,
                         int24 priceTick, int24 bidTick, int24 askTick)
        public pure returns (uint128) {
        return PriceImprove.improveThresh
            (PriceImprove.formatSettings(unit, awayTicks, mults),
             inBase, tickSize, priceTick, bidTick, askTick);
    }

    function testClipInside (uint16 tickSize, int24 bidTick, int24 askTick)
        public pure returns (uint24) {
        return PriceImprove.clipInside(tickSize, bidTick, askTick);
    }

    function testClipBelow (uint16 tickSize, int24 bidTick)
        public pure returns (uint24) {
        return PriceImprove.clipBelow(tickSize, bidTick);
    }

    function testClipAbove (uint16 tickSize, int24 askTick)
        public pure returns (uint24) {
        return PriceImprove.clipAbove(tickSize, askTick);
    }

    
}
