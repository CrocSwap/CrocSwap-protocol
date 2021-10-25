// SPDX-License-Identifier: Unlicensed                                                   

pragma solidity >=0.8.4;

import './TickMath.sol';
import './FixedPoint.sol';
import './SafeCast.sol';
import './CurveMath.sol';
import './Directives.sol';

import "hardhat/console.sol";

/* @title Price grid library.
 * @notice Functionality for tick-defined price grids and facilities for off-grid
 *         price improvement. */
library PriceGrid {
    using TickMath for int24;
    using SafeCast for uint256;
    using SafeCast for uint192;

    /* @notice Defines the off-grid price improvement options (if any) available to
     *         the user for new range orders on a specific pair.
     *
     * @param inBase_ If true the collateral thresholds apply to the base-side tokens.
     *                If false, applies to the quote-side tokens.
     * @param unitCollateral_ The minimum collateral commitment required for an off-grid
     *                range order *per tick* that's off grid.
     * @param awayTicks_ The maximum number of ticks away from the current price that an
     *                off-grid range order is allowed. */
    struct ImproveSettings {
        bool inBase_;
        uint128 unitCollateral_;
        uint16 awayTicks_;
    }

    /* @notice Asserts that a given range order is either on grid or eligble for off-grid
     *         price improvement.
     * @param set The off-grid price improvement requirements active for this pool.
     * @param lowTick The lower tick index of the range order.
     * @param highTick The upper tick index of the range order.
     * @param liquidity The amount of liquidity in the range order.
     * @param gridSize The grid size associated with the pool in ticks.
     * @param priceTick The price tick of the current price in the pool. */
    function verifyFit (ImproveSettings memory set, int24 lowTick, int24 highTick,
                        uint128 liquidity, uint16 gridSize, int24 priceTick)
        internal pure {
        if (!isOnGrid(lowTick, highTick, gridSize)) {
            uint128 thresh = improveThresh(set, gridSize, priceTick,
                                           lowTick, highTick);
            require(liquidity >= thresh, "D");
        }
    }

    /* @notice Asserts that a given range order is on grid.
     * @param lowTick The lower tick index of the range order.
     * @param highTick The upper tick index of the range order.
     * @param gridSize The grid size associated with the pool in ticks. */
    function verifyFit (int24 lowTick, int24 highTick, uint16 gridSize) internal pure {
        require(isOnGrid(lowTick, highTick, gridSize), "D");
    }

    /* @notice Returns true if the boundaries of a range order occur on the tick grid.
     * @param lowTick The lower tick index of the range order.
     * @param highTick The upper tick index of the range order.
     * @param gridSize The grid size associated with the pool in ticks. */
    function isOnGrid (int24 lowerTick, int24 upperTick, uint16 gridSize)
        internal pure returns (bool) {
        int24 tickNorm = int24(uint24(gridSize));
        return lowerTick % tickNorm == 0 &&
            upperTick % tickNorm == 0;
    }

    /* @notice Calculates the minimum liquidity required for a range order to be eligible
     *         for off-grid price improvement.
     * @param set The off-grid price improvement requirements active for this pool.
     * @param tickSize The size of the grid in tick granularity.
     * @param priceTick The price tick of the current price in the pool.
     * @param bidTick The lower tick index of the range order.
     * @param askTick The upper tick index of the range order.
     * @return The elibility threshold represented as newly minted liquidity. */
    function improveThresh (ImproveSettings memory set,
                            uint16 tickSize, int24 priceTick,
                            int24 bidTick, int24 askTick)
        internal pure returns (uint128) {
        require(bidTick < askTick);
        return canImprove(set, priceTick, bidTick, askTick) ?
            improvableThresh(set, tickSize, bidTick, askTick) :
            type(uint128).max;
    }


    /* @notice Calculated the liquidity threshold for price improvement, assuming that
     *    the order is eligible. */
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

    /* @notice Calculates the liquidity threshold for a range where both boundaries
     *         are off grid. */
    function liqForClip (ImproveSettings memory set, uint24 wingSize,
                         int24 refTick)
        private pure returns (uint128 liqDemand) {
        // If neither side is tethered to the grid the gas burden is twice as high
        // because there's two out-of-band crossings
        return 2 * liqForWing(set, wingSize, refTick);
    }
    
    /* @notice Calculates the liquidity threshold for a range where one boundary is
     *         off grid and one boundary is on grid. */
    function liqForWing (ImproveSettings memory set, uint24 wingSize,
                         int24 refTick)
        private pure returns (uint128) {
        if (wingSize == 0) { return 0; }
        uint128 collateral = set.unitCollateral_;
        return convertToLiq(collateral, refTick, wingSize, set.inBase_);
    }

    /* @notice Given a range boundary determines the number of encompassed ticks
     *    that are off-grid. */
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

    /* @notice Determines off-grid tick size from a normalized range boundary that's
     *    safe for modular arithmetic. */
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

    /* @notice Returns the number of off-grid ticks associated with the left side of
     *   a multi-grid spanning range order. */
    function clipBelow (uint16 tickSize, int24 bidTick)
        internal pure returns (uint24) {
        if (bidTick < 0) { return clipAbove(tickSize, -bidTick); }
        if (bidTick == 0) { return 0; }
        
        uint24 bidNorm = uint24(bidTick);
        uint24 tickNorm = uint24(tickSize);
        uint24 gridTick = ((bidNorm - 1) / tickNorm + 1) * tickNorm;
        return gridTick - bidNorm;
    }

    /* @notice Returns the number of off-grid ticks associated with the right side of
     *   a multi-grid spanning range order. */
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
        uint128 priceTick = tick.getSqrtRatioAtTick();
        uint128 priceWing = (tick + int24(wingSize)).getSqrtRatioAtTick();
        return CurveMath.liquiditySupported(collateral, inBase, priceTick, priceWing);
    }

    /* @notice Returns true if the range order is within proximity to the curve's price
     *    tick enough to be eligible for off-grid price improvement. */
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
