// SPDX-License-Identifier: GPL-3                                                          
pragma solidity ^0.8.4;
pragma experimental ABIEncoderV2;

import '../libraries/LiquidityMath.sol';
import '../libraries/TickMath.sol';
import './TickCensus.sol';
import './StorageLayout.sol';
import './ColdInjector.sol';

/* @title Level Book Mixin
 * @notice Mixin contract that tracks the aggregate liquidity bumps and in-range reward
 *         accumulators on a per-tick basis. */
contract LevelBook is TickCensus {
    using SafeCast for uint128;
    using LiquidityMath for uint128;
    using LiquidityMath for uint96;

    /* Book level structure exists one-to-one on a tick basis (though could possibly be
     * zero-valued). For each tick we have to track three values:
     *    bidLots_ - The concentrated liquidity bump that's added to the AMM curve when
     *               the price moves into the tick from above. Denominated in (1024-unit)
     *               lots.
     *    askLots_ - The concentrated liquidity bump that's added to the AMM curve when
     *               the price moves into the tick from below. Denominated in lots.
     *    feeOdometer_ - The liquidity fee rewards accumulator that's checkpointed 
     *       whenever the price crosses the tick boundary. Used to calculate the 
     *       cumulative fee rewards on any arbitrary lower-upper tick range. This is
     *       generically represented as a per-liquidity unit 128-bit fixed point 
     *       cumulative growth rate. */

    /* @notice Called when the curve price moves through the tick boundary. Performs
     *         the necessary accumulator checkpointing and deriving the liquidity bump.
     *
     * @dev    Note that this function call is *not* idempotent. It's the callers 
     *         responsibility to only call once per tick cross direction. Otherwise 
     *         behavior is undefined. This is safe to call with non-initialized zero
     *         ticks but should generally be avoided for gas efficiency reasons.
     *
     * @param poolIdx - The hash index of the pool being traded on.
     * @param tick - The 24-bit tick index being crossed.
     * @param isBuy - If true indicates that price is crossing the tick boundary from 
     *                 below. If false, means tick is being crossed from above. 
     * @param feeGlobal - The up-to-date global fee reward accumulator value. Used to
     *                    checkpoint the tick rewards for calculating accumulated rewards
     *                    in a range. Represented as 128-bit fixed point cumulative 
     *                    growth rate per unit of liquidity.
     *
     * @return liqDelta - The net change in concentrated liquidity that should be applied
     *                    to the AMM curve following this level cross.
     * @return knockoutFlag - Indicates that the liquidity of the cross level has a 
     *                        knockout flag toggled. Upstream caller should handle 
     *                        appropriately */
    function crossLevel (bytes32 poolIdx, int24 tick, bool isBuy, uint64 feeGlobal)
        internal returns (int128 liqDelta, bool knockoutFlag) {
        
        BookLevel storage lvl = fetchLevel(poolIdx, tick);
        int128 crossDelta = LiquidityMath.netLotsOnLiquidity
            (lvl.bidLots_, lvl.askLots_);
        
        liqDelta = isBuy ? crossDelta : -crossDelta;
        if (feeGlobal != lvl.feeOdometer_) {
            lvl.feeOdometer_ = feeGlobal - lvl.feeOdometer_;
        }                

        knockoutFlag = isBuy ?
            lvl.askLots_.hasKnockoutLiq() :
            lvl.bidLots_.hasKnockoutLiq();
    }

    /* @notice Retrieves the level book state associated with the tick. */
    function levelState (bytes32 poolIdx, int24 tick) internal view returns
        (BookLevel memory) {
        return levels_[keccak256(abi.encodePacked(poolIdx, tick))];
    }

    /* @notice Retrieves a storage pointer to the level associated with the tick. */
    function fetchLevel (bytes32 poolIdx, int24 tick) internal view returns
        (BookLevel storage) {
        return levels_[keccak256(abi.encodePacked(poolIdx, tick))];
    }

    /* @notice Deletes the level at the tick. */
    function deleteLevel (bytes32 poolIdx, int24 tick) private {
        delete levels_[keccak256(abi.encodePacked(poolIdx, tick))];
    }

    /* @notice Adds the liquidity associated with a new range order into the associated
     *         book levels, initializing the level structs if necessary.
     * 
     * @param poolIdx - The index of the pool the liquidity is being added to.
     * @param midTick - The tick index associated with the current price of the AMM curve
     * @param bidTick - The tick index for the lower bound of the range order.
     * @param askTick - The tick index for the upper bound of the range order.
     * @param liq - The amount of liquidity being added by the range order.
     * @param feeGlobal - The up-to-date global fee rewards growth accumulator. 
     *    Represented as 128-bit fixed point growth rate.
     *
     * @return feeOdometer - Returns the current fee reward accumulator value for the
     *    range specified by the order. This is necessary, so we consumers of this mixin
     *    can subtract the rewards accumulated before the order was added. */
    function addBookLiq (bytes32 poolIdx, int24 midTick, int24 bidTick, int24 askTick,
                         uint96 lots, uint64 feeGlobal)
        internal returns (uint64 feeOdometer) {

        // Make sure to init before add, because init logic relies on pre-add liquidity
        initLevel(poolIdx, midTick, bidTick, feeGlobal);
        initLevel(poolIdx, midTick, askTick, feeGlobal);

        addBid(poolIdx, bidTick, lots);
        addAsk(poolIdx, askTick, lots);
        feeOdometer = clockFeeOdometer(poolIdx, midTick, bidTick, askTick, feeGlobal);
    }

    /* @notice Call when removing liquidity associated with a specific range order.
     *         Decrements the associated tick levels as necessary.
     *
     * @param poolIdx - The index of the pool the liquidity is being removed from.
     * @param midTick - The tick index associated with the current price of the AMM curve
     * @param bidTick - The tick index for the lower bound of the range order.
     * @param askTick - The tick index for the upper bound of the range order.
     * @param liq - The amount of liquidity being added by the range order.
     * @param feeGlobal - The up-to-date global fee rewards growth accumulator. 
     *    Represented as 128-bit fixed point growth rate.
     *
     * @return feeOdometer - Returns the current fee reward accumulator value for the
     *    range specified by the order. Note that this returns the accumulated rewards
     *    from the range history, including *before* the order was added. It's the 
     *    downstream user's responsibility to adjust this value with the odometer clock
     *    from addBookLiq to correctly calculate the rewards accumulated over the 
     *    lifetime of the order. */     
    function removeBookLiq (bytes32 poolIdx, int24 midTick, int24 bidTick, int24 askTick,
                            uint96 lots, uint64 feeGlobal)
        internal returns (uint64 feeOdometer) {
        bool deleteBid = removeBid(poolIdx, bidTick, lots);
        bool deleteAsk = removeAsk(poolIdx, askTick, lots);
        feeOdometer = clockFeeOdometer(poolIdx, midTick, bidTick, askTick, feeGlobal);

        if (deleteBid) { deleteLevel(poolIdx, bidTick); }
        if (deleteAsk) { deleteLevel(poolIdx, askTick); }
    }

    /* @notice Initializes a new level, including marking the tick as active in the 
     *         bitmap, if the level doesn't previously exist. */
    function initLevel (bytes32 poolIdx, int24 midTick,
                        int24 tick, uint64 feeGlobal) private {
        BookLevel storage lvl = fetchLevel(poolIdx, tick);
        if (lvl.bidLots_ == 0 && lvl.askLots_ == 0) {
            if (tick >= midTick) {
                lvl.feeOdometer_ = feeGlobal;
            }
            bookmarkTick(poolIdx, tick);
        }
    }

    /* @notice Increments bid liquidity on a previously existing level. */
    function addBid (bytes32 poolIdx, int24 tick, uint96 incrLots) private {
        BookLevel storage lvl = fetchLevel(poolIdx, tick);
        uint96 prevLiq = lvl.bidLots_;
        uint96 newLiq = prevLiq.addLots(incrLots);
        lvl.bidLots_ = newLiq;
    }

    /* @notice Increments ask liquidity on a previously existing level. */    
    function addAsk (bytes32 poolIdx, int24 tick, uint96 incrLots) private {
        BookLevel storage lvl = fetchLevel(poolIdx, tick);
        uint96 prevLiq = lvl.askLots_;
        uint96 newLiq = prevLiq.addLots(incrLots);
        lvl.askLots_ = newLiq;
    }

    /* @notice Decrements bid liquidity on a level, and also removes the level from
     *          the tick bitmap if necessary. */
    function removeBid (bytes32 poolIdx, int24 tick,
                        uint96 subLots) private returns (bool) {
        BookLevel storage lvl = fetchLevel(poolIdx, tick);
        uint96 prevLiq = lvl.bidLots_;
        uint96 newLiq = prevLiq.minusLots(subLots);

        // A level should only be marked inactive in the tick bitmap if *both* bid and
        // ask liquidity are zero.
        lvl.bidLots_ = newLiq;
        if (newLiq == 0 && lvl.askLots_ == 0) {
            forgetTick(poolIdx, tick);
            return true;
        }
        return false;
    }    

    /* @notice Decrements ask liquidity on a level, and also removes the level from
     *          the tick bitmap if necessary. */    
    function removeAsk (bytes32 poolIdx, int24 tick,
                        uint96 subLots) private returns (bool) {
        BookLevel storage lvl = fetchLevel(poolIdx, tick);
        uint96 prevLiq = lvl.askLots_;
        uint96 newLiq = prevLiq.minusLots(subLots);
        
        lvl.askLots_ = newLiq;
        if (newLiq == 0 && lvl.bidLots_ == 0) {
            forgetTick(poolIdx, tick);
            return true;
        }
        return false;
    }    

    /* @notice Calculates the current accumulated fee rewards in a given concentrated
     *         liquidity tick range. The difference between this value at two different
     *         times is guaranteed to reflect the accumulated rewards in the tick range
     *         between those two times.
     *
     *         For more explanation on how the fee rewards accumulated is calculated for
     *         a given range order, reference the documenation at [docs/FeeOdometer.md]
     *         in the project repository.
     *
     * @dev This returned result only has meaning when compared against the result
     *      from the same method call on the same range at a different time. Any
     *      given range could have an arbitrary offset relative to the pool's actual
     *      cumulative rewards.
     *
     * @param poolIdx The hash key specifying the pool being operated on.
     * @param currentTick The price tick of the curve's current price
     * @param lowerTick The prick tick of the lower boundary of the range order
     * @param lowerTick The prick tick of the upper boundary of the range order
     * @param feeGlobal The cumulative rewards accumulated to a single unit of 
     *                  concentrated liquidity that was active since pool inception.
     *
     * @return The cumulative growth rate to a single unit of concentrated liquidity
     *         within the range. (Adjusted for an arbitrary offset that stays consistent
     *         over time. Only use this number to compare growth in the range over two
     *         points in time) */
    function clockFeeOdometer (bytes32 poolIdx, int24 currentTick,
                               int24 lowerTick, int24 upperTick, uint64 feeGlobal)
        internal view returns (uint64) {
        uint64 feeLower = pivotFeeBelow(poolIdx, lowerTick, currentTick, feeGlobal);
        uint64 feeUpper = pivotFeeBelow(poolIdx, upperTick, currentTick, feeGlobal);
        
        // This is unchecked because we often rely on circular overflow arithmetic
        // when ticks are initialized at different times. Remember the output of this
        // function is only used to compare across time.
        unchecked {
            return feeUpper - feeLower;
        }
    }

    /* @dev Internally we checkpoint the last global accumulator value from the last
     *      time the level was crossed. Because fees can only accumulate when price
     *      is in range, the checkpoint represents the global fees that accumulated
     *      on the outside of the tick level. (Though this may be faked for fees that
     *      that accumulated prior to level initialization. It doesn't matter, because
     *      all we use this value for is calculating the delta of fee accumulation 
     *      between two different post-initialization points in time.)
     *
     *      For more explanation on how the per-tick fee odometer related to the 
     *      cumulative fees in a give range, reference the documenation at 
     *      [docs/FeeOdometer.md] in the project repository. */
    function pivotFeeBelow (bytes32 poolIdx, int24 lvlTick,
                            int24 currentTick, uint64 feeGlobal)
        private view returns (uint64) {
        BookLevel storage lvl = fetchLevel(poolIdx, lvlTick);
        return lvlTick <= currentTick ?
            lvl.feeOdometer_ :
            feeGlobal - lvl.feeOdometer_;            
    }
}

