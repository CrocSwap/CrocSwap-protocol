// SPDX-License-Identifier: Unlicensed                                                   

pragma solidity >=0.8.4;

import './TickMath.sol';
import './FixedPoint.sol';
import './SafeCast.sol';
import './CurveMath.sol';
import './Directives.sol';

import "hardhat/console.sol";

library PriceGrid {
    using TickMath for int24;
    using SafeCast for uint256;
    using SafeCast for uint192;

    function verifyFit (ImproveSettings memory set, int24 lowTick, int24 highTick,
                        bool isAdd, uint128 liquidity,
                        uint16 gridSize, int24 priceTick) internal pure {
        if (isAdd) {
            if (!isOnGrid(lowTick, highTick, gridSize)) {
                uint128 thresh = improveThresh(set, gridSize, priceTick,
                                               lowTick, highTick);
                require(liquidity >= thresh, "D");
            }
        }
    }

    function isOnGrid (int24 lowerTick, int24 upperTick, uint16 gridSize)
        internal pure returns (bool) {
        int24 tickNorm = int24(uint24(gridSize));
        return lowerTick % tickNorm == 0 &&
            upperTick % tickNorm == 0;
    }

    struct ImproveSettings {
        bool inBase_;
        uint128 unitCollateral_;
        uint16 awayTicks_;
        int8 mult1_;
        int8 mult2_;
        int8 mult4_;
        int8 mult6_;
        int8 mult8_;
        int8 mult12_;
        int8 mult16_;
        int8 mult24_;
        int8 mult32_;
        int8 mult40_;
        int8 mult48_;
        int8 mult64_;
        int8 mult96_;
    }

    function emptySettings() internal pure returns (ImproveSettings memory) {
        return ImproveSettings({
            inBase_: false,
                    unitCollateral_: 0,
                    awayTicks_: 0,
                    mult1_: 0,
                    mult2_: 0,
                    mult4_: 0,
                    mult6_: 0,
                    mult8_: 0,
                    mult12_: 0,
                    mult16_: 0,
                    mult24_: 0,
                    mult32_: 0,
                    mult40_: 0,
                    mult48_: 0,
                    mult64_: 0,
                    mult96_: 0});
    }
    
    function formatSettings (bool inBase, uint128 unitCollateral,
                             uint16 awayTicks, int8[] calldata mults)
        internal pure returns (ImproveSettings memory) {
        require(mults.length == 13);
        return ImproveSettings({
            inBase_: inBase,
                    unitCollateral_: unitCollateral,
                    awayTicks_: awayTicks,
                    mult1_: mults[0],
                    mult2_: mults[1],
                    mult4_: mults[2],
                    mult6_: mults[3],
                    mult8_: mults[4],
                    mult12_: mults[5],
                    mult16_: mults[6],
                    mult24_: mults[7],
                    mult32_: mults[8],
                    mult40_: mults[9],
                    mult48_: mults[10],
                    mult64_: mults[11],
                    mult96_: mults[12]});
    }
    
    function improveThresh (ImproveSettings memory set,
                            uint16 tickSize, int24 priceTick,
                            int24 bidTick, int24 askTick)
        internal pure returns (uint128) {
        require(bidTick < askTick);
        return canImprove(set, priceTick, bidTick, askTick) ?
            improvableThresh(set, tickSize, bidTick, askTick) :
            type(uint128).max;
    }

    
    function improvableThresh (ImproveSettings memory set,
                               uint16 tickSize, int24 bidTick, int24 askTick)
        private pure returns (uint128) {
        uint24 unitClip = clipInside(tickSize, bidTick, askTick);
        if (unitClip > 0) {
            return liqForClip(set, unitClip, bidTick);
        } else {
            uint24 bidWing = clipBelow(tickSize, bidTick);
            uint24 askWing = clipAbove(tickSize, askTick);
            return liqForWing(set, bidWing, bidTick) +
                liqForWing(set, askWing, askTick);
        }
    }

    // If neither side is tethered to the grid the gas burden is twice as high
    // because there's two out-of-band crossings
    function liqForClip (ImproveSettings memory set, uint24 wingSize,
                         int24 refTick)
        private pure returns (uint128 liqDemand) {
        return 2 * liqForWing(set, wingSize, refTick);
    }

    function liqForWing (ImproveSettings memory set, uint24 wingSize,
                         int24 refTick)
        private pure returns (uint128) {
        if (wingSize == 0) { return 0; }
        uint128 collateral = scaleCollateral(set, wingSize);
        return convertToLiq(collateral, refTick, wingSize, set.inBase_);
    }

    function clipInside (uint16 tickSize, int24 bidTick, int24 askTick)
        internal pure returns (uint24) {
        require(bidTick < askTick);
        if (bidTick < 0 && askTick < 0) {
            return clipInside(tickSize, -askTick, -bidTick);
        } else if (bidTick < 0 && askTick >= 0) {
            return 0;
        } else {
            return clipNorm(uint24(tickSize), uint24(bidTick),
                            uint24(askTick));
        }
    }

    function clipNorm (uint24 tickSize, uint24 bidTick, uint24 askTick)
        internal pure returns (uint24) {
        if (bidTick % tickSize == 0 || askTick % tickSize == 0) {
            return 0;
        } else if ((bidTick / tickSize) != (askTick / tickSize)) {
            return 0;
        } else {
            return askTick - bidTick;
        }
    }

    function clipBelow (uint16 tickSize, int24 bidTick)
        internal pure returns (uint24) {
        if (bidTick < 0) { return clipAbove(tickSize, -bidTick); }
        if (bidTick == 0) { return 0; }
        
        uint24 bidNorm = uint24(bidTick);
        uint24 tickNorm = uint24(tickSize);
        uint24 gridTick = ((bidNorm - 1) / tickNorm + 1) * tickNorm;
        return gridTick - bidNorm;
    }

    function clipAbove (uint16 tickSize, int24 askTick)
        internal pure returns (uint24) {
        if (askTick < 0) { return clipBelow(tickSize, -askTick); }
        
        uint24 askNorm = uint24(askTick);
        uint24 tickNorm = uint24(tickSize);
        uint24 gridTick = (askNorm / tickNorm) * tickNorm;
        return askNorm - gridTick;
    }

    /* We're converting from generalized collateral requirements to position-specific 
     * liquidity requirements. This is approximately the inversion of calculating 
     * collateral given liquidity. Therefore, we can just use the pre-existing CurveMath.
     * We're not worried about exact results in this context anyway. Remember this is
     * only being used to set an approximate economic threshold for allowing users to
     * add liquidity inside the grid. */
    function convertToLiq (uint128 collateral, int24 tick, uint24 wingSize, bool inBase)
        private pure returns (uint128) {
        if (inBase) {
            uint128 priceX = tick.getSqrtRatioAtTick();
            uint128 priceY = (tick + int24(wingSize)).getSqrtRatioAtTick();
            return uint256(FixedPoint.divQ64(collateral, priceY - priceX)).toUint128();
        } else {
            return convertToLiq(collateral, -tick, wingSize, true);
        }
    }

    function scaleCollateral (ImproveSettings memory set, uint24 wingSize)
        private pure returns (uint128) {
        uint128 working = set.unitCollateral_;
        
        if (wingSize <= 1) { return working; }
        working = scaleByMult(working, set.mult1_);

        if (wingSize <= 2) { return working; }
        working = scaleByMult(working, set.mult2_);

        if (wingSize <= 4) { return working; }
        working = scaleByMult(working, set.mult4_);

        if (wingSize <= 6) { return working; }
        working = scaleByMult(working, set.mult6_);

        if (wingSize <= 8) { return working; }
        working = scaleByMult(working, set.mult8_);

        if (wingSize <= 12) { return working; }
        working = scaleByMult(working, set.mult12_);

        if (wingSize <= 16) { return working; }
        working = scaleByMult(working, set.mult16_);

        if (wingSize <= 24) { return working; }
        working = scaleByMult(working, set.mult24_);

        if (wingSize <= 32) { return working; }
        working = scaleByMult(working, set.mult32_);

        if (wingSize <= 40) { return working; }
        working = scaleByMult(working, set.mult40_);

        if (wingSize <= 48) { return working; }
        working = scaleByMult(working, set.mult48_);

        if (wingSize <= 64) { return working; }
        working = scaleByMult(working, set.mult64_);

        if (wingSize <= 96) { return working; }
        working = scaleByMult(working, set.mult96_);

        return working;
    }

    function scaleByMult (uint128 working, int8 mult) private pure returns (uint128) {
        if (working == type(uint128).max || mult == 0) {
            return type(uint128).max;
        } else if (mult < 0) {
            return working / uint128(uint8(-mult));
        } else {
            return working * uint128(uint8(mult));
        }
    }

    function canImprove (ImproveSettings memory set, int24 priceTick,
                         int24 bidTick, int24 askTick)
        private pure returns (bool) {
        if (set.unitCollateral_ == 0) { return false; }
        
        uint24 bidDist = diffTicks(bidTick, priceTick);
        uint24 askDist = diffTicks(priceTick, askTick);
        return bidDist <= set.awayTicks_ &&
            askDist <= set.awayTicks_;
    }

    function diffTicks (int24 tickX, int24 tickY) private pure returns (uint24) {
        return tickY > tickX ?
            uint24(tickY - tickX) : uint24(tickX - tickY);
    }
}
