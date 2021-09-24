// SPDX-License-Identifier: Unlicensed                                                          
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import '../libraries/FullMath.sol';
import '../libraries/LiquidityMath.sol';
import '../libraries/TickMath.sol';
import '../libraries/TickCensus.sol';

/* @title Level Book Mixin
 * @notice Mixin contract that tracks the aggregate liquidity bumps and in-range reward
 *         accumulators on a per-tick basis. */
contract LevelBook {
    using SafeCast for uint128;
    using LiquidityMath for uint128;
    using LiquidityMath for uint96;
    using TickCensusLib for TickCensusLib.TickCensus;

    /* Book level structure exists one-to-one on a tick basis (though could possibly be
     * zero-valued). For each tick we have to track three values:
     *    bidLots_ - The concentrated liquidity bump that's added to the AMM curve when
     *               the price moves into the tick from above.
     *    askLots_ - The concentrated liquidity bump that's added to the AMM curve when
     *               the price moves into the tick from below.
     *    feeOdometer_ - The liquidity fee rewards accumulator that's checkpointed 
     *       whenever the price crosses the tick boundary. Used to calculate the 
     *       cumulative fee rewards on any arbitrary lower-upper tick range. This is
     *       generically represented as a per-liquidity unit 128-bit fixed point 
     *       cumulative growth rate. */
    struct BookLevel {
        uint96 bidLots_;
        uint96 askLots_;
        uint64 feeOdometer_;
    }

    uint16 constant LOT_SIZE = 1024;
    uint8 constant LOT_SIZE_BITS = 10;

    mapping(bytes32 => BookLevel) private levels_;
    mapping(uint16 => uint16) private tickSizes_;
    TickCensusLib.TickCensus ticks_;


    /* @notice Called when the curve price moves through the tick boundary. Performs
     *         the necessary accumulator checkpointing and deriving the liquidity bump.
     *
     * @dev    Note that this function call is *not* idempotent. It's the callers 
     *         responsibility to only call once per tick cross direction. Otherwise 
     *         behavior is undefined. This is safe to call with non-initialized zero
     *         ticks but should generally be avoided for gas efficiency reasons.
     *
     * @param poolIdx - The index of the pool being traded on.
     * @param tick - The 24-bit tick index being crossed.
     * @param isBuy - If true indicates that price is crossing the tick boundary from 
     *                 below. If false, means tick is being crossed from above. 
     * @param feeGlobal - The up-to-date global fee reward accumulator value. Used to
     *                    checkpoint the tick rewards for calculating accumulated rewards
     *                    in a range. Represented as 128-bit fixed point cumulative 
     *                    growth rate per unit of liquidity.
     *
     * @return liqDelta - The net change in concentrated liquidity that should be applied
     *                    to the AMM curve following this level cross. */
    function crossLevel (uint8 poolIdx, int24 tick, bool isBuy, uint64 feeGlobal)
        internal returns (int256 liqDelta) {
        BookLevel storage lvl = fetchLevel(poolIdx, tick);
        int256 crossDelta = LiquidityMath.netLotsOnLiquidity
            (lvl.bidLots_, lvl.askLots_);
        
        liqDelta = isBuy ? crossDelta : -crossDelta;
        if (feeGlobal != lvl.feeOdometer_) {
            lvl.feeOdometer_ = feeGlobal - lvl.feeOdometer_;
        }
    }

    /* @notice Retrieves the level book state associated with the tick. */
    function levelState (uint8 poolIdx, int24 tick) internal view returns
        (BookLevel memory) {
        return levels_[keccak256(abi.encodePacked(poolIdx, tick))];
    }

    function fetchLevel (uint8 poolIdx, int24 tick) private view returns
        (BookLevel storage) {
        return levels_[keccak256(abi.encodePacked(poolIdx, tick))];
    }

    function deleteLevel (uint8 poolIdx, int24 tick) private {
        delete levels_[keccak256(abi.encodePacked(poolIdx, tick))];
    }

    /* @notice Adds the liquidity associated with a new range order into the associated
     *         book levels, initializing the level structs if necessary.
     *
     * @dev This method will enforce the minimum tick spacing constraint by requiring 
     *      that any upper or lower bound tick index is modulo the current tick size. 
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
    function addBookLiq (uint8 poolIdx, int24 midTick, int24 bidTick, int24 askTick,
                         uint128 liq, uint64 feeGlobal)
        internal returns (uint64 feeOdometer) {
        uint96 lots = liq.liquidityToLots();
        assertTickSize(bidTick, askTick, tickSizes_[poolIdx]);

        // Make sure to init before add, because init logic relies on pre-add liquidity
        initLevel(poolIdx, midTick, bidTick, feeGlobal);
        initLevel(poolIdx, midTick, askTick, feeGlobal);

        addBid(poolIdx, bidTick, lots);
        addAsk(poolIdx, askTick, lots);
        feeOdometer = clockFeeOdometer(poolIdx, midTick, bidTick, askTick, feeGlobal);
    }

    /* @notice Sets the tick spacing constraint. After being set all new orders will 
     *    only be allowed to add at tick indices module this set value. Set to 0 to
     *    allow orders at every tick. */
    function setTickSize (uint8 poolIdx, uint16 tickSize) internal {
        tickSizes_[poolIdx] = tickSize;
    }

    /* @notice Returns the currently set tick spacing contraint. */
    function getTickSize (uint8 poolIdx) internal view returns (uint16) {
        return tickSizes_[poolIdx];
    }

    function assertTickSize (int24 bidTick, int24 askTick, uint16 tickSize)
        internal pure {
        if (tickSize > 0) {
            require(bidTick % int24(uint24(tickSize)) == 0, "D");
            require(askTick % int24(uint24(tickSize)) == 0, "D");
        }
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
    function removeBookLiq (uint8 poolIdx, int24 midTick, int24 bidTick, int24 askTick,
                            uint128 liq, uint64 feeGlobal)
        internal returns (uint64 feeOdometer) {
        uint96 lots = liq.liquidityToLots();
        bool deleteBid = removeBid(poolIdx, bidTick, lots);
        bool deleteAsk = removeAsk(poolIdx, askTick, lots);
        feeOdometer = clockFeeOdometer(poolIdx, midTick, bidTick, askTick, feeGlobal);
        
        if (deleteBid) { deleteLevel(poolIdx, bidTick); }
        if (deleteAsk) { deleteLevel(poolIdx, askTick); }
    }

    function initLevel (uint8 poolIdx, int24 midTick,
                        int24 tick, uint64 feeGlobal) private {
        BookLevel storage lvl = fetchLevel(poolIdx, tick);
        if (lvl.bidLots_ == 0 && lvl.askLots_ == 0) {
            if (tick >= midTick) {
                lvl.feeOdometer_ = feeGlobal;
            }
            ticks_.bookmarkTick(poolIdx, tick);
        }
    }
    
    function addBid (uint8 poolIdx, int24 tick, uint96 incrLots) private {
        BookLevel storage lvl = fetchLevel(poolIdx, tick);
        uint96 prevLiq = lvl.bidLots_;
        uint96 newLiq = prevLiq.addLots(incrLots);
        lvl.bidLots_ = newLiq;
    }

    function addAsk (uint8 poolIdx, int24 tick, uint96 incrLots) private {
        BookLevel storage lvl = fetchLevel(poolIdx, tick);
        uint96 prevLiq = lvl.askLots_;
        uint96 newLiq = prevLiq.addLots(incrLots);
        lvl.askLots_ = newLiq;
    }
    
    function removeBid (uint8 poolIdx, int24 tick,
                        uint96 subLots) private returns (bool) {
        BookLevel storage lvl = fetchLevel(poolIdx, tick);
        uint96 prevLiq = lvl.bidLots_;
        uint96 newLiq = prevLiq.minusLots(subLots);
        
        lvl.bidLots_ = newLiq;
        if (newLiq == 0 && lvl.askLots_ == 0) {
            ticks_.forgetTick(poolIdx, tick);
            return true;
        }
        return false;
    }    

    function removeAsk (uint8 poolIdx, int24 tick,
                        uint96 subLots) private returns (bool) {
        BookLevel storage lvl = fetchLevel(poolIdx, tick);
        uint96 prevLiq = lvl.askLots_;
        uint96 newLiq = prevLiq.minusLots(subLots);
        
        lvl.askLots_ = newLiq;
        if (newLiq == 0 && lvl.bidLots_ == 0) {
            ticks_.forgetTick(poolIdx, tick);
            return true;
        }
        return false;
    }    

    /* @notice Calculates the current accumulated fee rewards in a given concentrated
     *         liquidity tick range. The difference between this value at two different
     *         times is guaranteed to reflect the accumulated rewards in the tick range
     *         between those two times.
     * @dev This returned result only has meaning when compared against the result
     *      from the same method call on the same range at a different time. Any
     *      given range could have an arbitrary offset relative to the pool's actual
     *      cumulative rewards. */
    function clockFeeOdometer (uint8 poolIdx, int24 currentTick,
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
     *      between two different post-initialization points in time.) */
    function pivotFeeBelow (uint8 poolIdx, int24 lvlTick,
                            int24 currentTick, uint64 feeGlobal)
        private view returns (uint64) {
        BookLevel storage lvl = fetchLevel(poolIdx, lvlTick);
        return lvlTick <= currentTick ?
            lvl.feeOdometer_ :
            feeGlobal - lvl.feeOdometer_;            
    }

    /* @notice Returns the next tick that we can safely swap to within the bitmap. This
     *         will either be the next liquidity bump or the end of the bitmap.
     *
     * @param poolIdx Index of the pool who's ticks are being checked.
     * @param isBuy Set to true if we're looking at ticks above the current.
     * @param midTick The 24-bit tick index of the current price.
     * @return bumpTick The 24-bit tick index of the tick we can safely swap to in a 
     *                  locally stable AMM curve.
     * @return spllsOver Returns true if the bump is related to reaching the censored 
     *                   end of the local bitmap instead of a genuine liquidity bump. */
    function pinTickMap (uint8 poolIdx, bool isBuy, int24 midTick) internal view returns
        (int24 bumpTick, bool spillsOver) {
        uint256 termBitmap = ticks_.terminusBitmap(poolIdx, midTick);
        (bumpTick, spillsOver) = TickCensusLib.pinBitmap(isBuy, midTick, termBitmap);
    }

    /* @notice Escalates a tick seek after spilling from the pinBitmap call from above.
     *         Finds the location of the next liquidity bump from outside the bitmap.
     *
     * @param poolIdx Index of the pool who's ticks are being checked.
     * @param borderTick The 24-bit tick index returned by a pinBitmap() spill result.
     * @param isbuy      Set to true, when we're seeking ticks above the current.
     * @return bumpTick  The tick index of the next liquidity bump.
     * @return tightSpill Returns true if the bump occurs immediately after the censored
     *                    horizon. If this is true, it means pinBitmap() is already at a
     *                    a liquidity bump border. */
    function seekTickSpill (uint8 poolIdx, int24 borderTick, bool isBuy)
        internal view returns
        (int24 bumpTick, bool tightSpill) {
        bumpTick = ticks_.seekMezzSpill(poolIdx, borderTick, isBuy);
        tightSpill = (bumpTick == borderTick);
    }

    function hasTick (uint8 poolIdx, int24 tick) internal view returns (bool) {
        return ticks_.hasTickBookmark(poolIdx, tick);
    }
}

