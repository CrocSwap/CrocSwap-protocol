// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../libraries/PriceGrid.sol";
import "../libraries/Directives.sol";

contract TestPriceGrid {

    function testThresh (bool inBase, uint128 unit, uint16 awayTicks,
                         int8[] calldata mults, uint16 tickSize,
                         int24 priceTick, int24 bidTick, int24 askTick)
        public pure returns (uint128) {
        return PriceGrid.improveThresh
            (PriceGrid.formatSettings(inBase, unit, awayTicks, mults),
             tickSize, priceTick, bidTick, askTick);
    }

    function testClipInside (uint16 tickSize, int24 bidTick, int24 askTick)
        public pure returns (uint24) {
        return PriceGrid.clipInside(tickSize, bidTick, askTick);
    }

    function testClipBelow (uint16 tickSize, int24 bidTick)
        public pure returns (uint24) {
        return PriceGrid.clipBelow(tickSize, bidTick);
    }

    function testClipAbove (uint16 tickSize, int24 askTick)
        public pure returns (uint24) {
        return PriceGrid.clipAbove(tickSize, askTick);
    }


    function testOnGrid (int24 lowerTick, int24 upperTick, uint16 gridSize)
        public pure returns (bool) {
        return PriceGrid.isOnGrid(lowerTick, upperTick, gridSize);
    }

    function testVerify (bool inBase, uint128 unit, uint16 awayTicks,
                         int8[] calldata mults, uint16 tickSize,
                         int24 priceTick, int24 bidTick, int24 askTick,
                         bool isAdd, uint128 liq) public pure {
        return PriceGrid.verifyFit(
            PriceGrid.formatSettings(inBase, unit, awayTicks, mults),
            Directives.RangeOrder({lowerTick_: bidTick,
                        upperTick_: askTick, isAdd_: isAdd,
                        liquidity_: liq}),
            tickSize, priceTick);
    }
                            
}
