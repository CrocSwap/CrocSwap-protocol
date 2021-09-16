// SPDX-License-Identifier: Unlicensed                                                          
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import '../libraries/FullMath.sol';
import '../libraries/FixedPoint128.sol';
import '../libraries/LiquidityMath.sol';
import '../libraries/TickMath.sol';
import './TickCensus.sol';

/* @title Level Book Mixin
 * @notice Mixin contract that tracks the aggregate liquidity bumps and in-range reward
 *         accumulators on a per-tick basis. */
contract LevelBook is TickCensus {
    using SafeCast for uint128;

    /* Book level structure exists one-to-one on a tick basis (though could possibly be
     * zero-valued). For each tick we have to track three values:
     *    bidLiq_ - The concentrated liquidity bump that's added to the AMM curve when
     *              the price moves into the tick from above.
     *    askLiq_ - The concentrated liquidity bump that's added to the AMM curve when
     *              the price moves into the tick from below.
     *    feeOdometer_ - The liquidity fee rewards accumulator that's checkpointed 
     *       whenever the price crosses the tick boundary. Used to calculate the 
     *       cumulative fee rewards on any arbitrary lower-upper tick range. This is
     *       generically represented as a per-liquidity unit 128-bit fixed point 
     *       cumulative growth rate. */
    struct BookLevel {
        uint128 bidLiq_;
        uint128 askLiq_;
        uint256 feeOdometer_;
    }
    
    mapping(int24 => BookLevel) private levels_;

    uint16 private tickSize_;

    /* @notice Retrieves the level book state associated with the tick. */
    function levelState (int24 tick) internal view
        returns (BookLevel memory) {
        return levels_[tick];
    }

    /* @notice Called when the curve price moves through the tick boundary. Performs
     *         the necessary accumulator checkpointing and deriving the liquidity bump.
     *
     * @dev    Note that this function call is *not* idempotent. It's the callers 
     *         responsibility to only call once per tick cross direction. Otherwise 
     *         behavior is undefined. This is safe to call with non-initialized zero
     *         ticks but should generally be avoided for gas efficiency reasons.
     *
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
    function crossLevel (int24 tick, bool isBuy, uint256 feeGlobal)
        internal returns (int256 liqDelta) {
        BookLevel memory lvl = levels_[tick];
        int256 crossDelta = int256(uint256(lvl.bidLiq_)) - int256(uint256(lvl.askLiq_));
        liqDelta = isBuy ? crossDelta : -crossDelta;
        
        if (feeGlobal != lvl.feeOdometer_) {
            levels_[tick].feeOdometer_ = feeGlobal - levels_[tick].feeOdometer_;
        }
    }

    /* @notice Adds the liquidity associated with a new range order into the associated
     *         book levels, initializing the level structs if necessary.
     *
     * @dev This method will enforce the minimum tick spacing constraint by requiring 
     *      that any upper or lower bound tick index is modulo the current tick size. 
     * 
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
    function addBookLiq (int24 midTick, int24 bidTick, int24 askTick, uint128 liq,
                         uint256 feeGlobal)
        internal returns (uint256 feeOdometer) {
        assertTickSize(bidTick, askTick);
        // Make sure to init before add, because init logic relies on pre-add liquidity
        initLevel(midTick, bidTick, feeGlobal);
        initLevel(midTick, askTick, feeGlobal);
        addBid(bidTick, liq);
        addAsk(askTick, liq);
        feeOdometer = clockFeeOdometer(midTick, bidTick, askTick, feeGlobal);
    }

    /* @notice Sets the tick spacing constraint. After being set all new orders will 
     *    only be allowed to add at tick indices module this set value. Set to 0 to
     *    allow orders at every tick. */
    function setTickSize (int24 tickSize) internal {
        require(tickSize >= 0 && uint24(tickSize) < type(uint16).max);
        tickSize_ = uint16(uint24(tickSize));
    }

    /* @notice Returns the currently set tick spacing contraint. */
    function getTickSize() internal view returns (uint16) {
        return tickSize_;
    }

    function assertTickSize (int24 bidTick, int24 askTick) internal view {
        if (tickSize_ > 0) {
            require(bidTick % int24(uint24(tickSize_)) == 0, "D");
            require(askTick % int24(uint24(tickSize_)) == 0, "D");
        }
    }

    /* @notice Call when removing liquidity associated with a specific range order.
     *         Decrements the associated tick levels as necessary.
     *
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
    function removeBookLiq (int24 midTick, int24 bidTick, int24 askTick, uint128 liq,
                            uint256 feeGlobal)
        internal returns (uint256 feeOdometer) {
        bool deleteBid = removeBid(bidTick, liq);
        bool deleteAsk = removeAsk(askTick, liq);
        feeOdometer = clockFeeOdometer(midTick, bidTick, askTick, feeGlobal);
        
        if (deleteBid) { delete levels_[bidTick]; }
        if (deleteAsk) { delete levels_[askTick]; }
    }

    function initLevel (int24 midTick, int24 tick, uint256 feeGlobal) private {
        if (levels_[tick].bidLiq_ == 0 && levels_[tick].askLiq_ == 0) {
            if (tick >= midTick) {
                levels_[tick].feeOdometer_ = feeGlobal;
            }
            bookmarkTick(tick);
        }
    }
    
    function addBid (int24 tick, uint128 incrLiq) private {
        BookLevel storage lvl = levels_[tick];
        uint128 prevLiq = lvl.bidLiq_;
        uint128 newLiq = LiquidityMath.addDelta(prevLiq, incrLiq);
        require(newLiq <= TickMath.MAX_TICK_LIQUIDITY, "L");
        lvl.bidLiq_ = newLiq;
    }

    function addAsk (int24 tick, uint128 incrLiq) private {
        BookLevel storage lvl = levels_[tick];
        uint128 prevLiq = lvl.askLiq_;
        uint128 newLiq = LiquidityMath.addDelta(prevLiq, incrLiq);
        require(newLiq <= TickMath.MAX_TICK_LIQUIDITY, "L");
        lvl.askLiq_ = newLiq;
    }
    
    function removeBid (int24 tick, uint128 subLiq) private returns (bool) {
        BookLevel storage lvl = levels_[tick];
        uint128 prevLiq = lvl.bidLiq_;
        require(subLiq <= prevLiq, "V");
        uint128 newLiq = LiquidityMath.addDelta(prevLiq, -(subLiq.uInt128ToInt128()));
        
        lvl.bidLiq_ = newLiq;
        if (newLiq == 0 && lvl.askLiq_ == 0) {
            forgetTick(tick);
            return true;
        }
        return false;
    }    

    function removeAsk (int24 tick, uint128 subLiq) private returns (bool) {
        BookLevel storage lvl = levels_[tick];
        uint128 prevLiq = lvl.askLiq_;
        require(subLiq <= prevLiq, "V");
        uint128 newLiq = LiquidityMath.addDelta(prevLiq, -(subLiq.uInt128ToInt128()));
        
        lvl.askLiq_ = newLiq;
        if (newLiq == 0 && lvl.bidLiq_ == 0) {
            forgetTick(tick);
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
    function clockFeeOdometer (int24 currentTick, int24 lowerTick, int24 upperTick,
                               uint256 feeGlobal)
        internal view returns (uint256) {
        uint256 feeLower = pivotFeeBelow(lowerTick, currentTick, feeGlobal);
        uint256 feeUpper = pivotFeeBelow(upperTick, currentTick, feeGlobal);
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
    function pivotFeeBelow (int24 lvlTick, int24 currentTick, uint256 feeGlobal)
        private view returns (uint256) {
        BookLevel storage lvl = levels_[lvlTick];
        return lvlTick <= currentTick ?
            lvl.feeOdometer_ :
            feeGlobal - lvl.feeOdometer_;            
    }
}

