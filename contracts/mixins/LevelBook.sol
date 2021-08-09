// SPDX-License-Identifier: Unlicensed                                                          
pragma solidity >0.7.1;
pragma experimental ABIEncoderV2;

import '../libraries/FullMath.sol';
import '../libraries/FixedPoint128.sol';
import '../libraries/LiquidityMath.sol';
import '../libraries/TickMath.sol';
import './TickCensus.sol';

contract LevelBook is TickCensus {

    struct BookLevel {
        uint128 bidLiq_;
        uint128 askLiq_;
        uint256 feeOdometer_;
    }

    mapping(int24 => BookLevel) private levels_;

    uint16 private tickSize_;

    function levelState (int24 tick) internal view
        returns (BookLevel memory) {
        return levels_[tick];
    }

    function crossLevel (int24 tick, bool isBuy, uint256 feeGlobal)
        internal returns (int256 liqDelta) {
        BookLevel memory lvl = levels_[tick];
        int256 crossDelta = int256(lvl.bidLiq_) - int256(lvl.askLiq_);
        liqDelta = isBuy ? crossDelta : -crossDelta;
        
        if (feeGlobal != lvl.feeOdometer_) {
            levels_[tick].feeOdometer_ = feeGlobal - levels_[tick].feeOdometer_;
        }
    }
    
    function addBookLiq (int24 midTick, int24 bidTick, int24 askTick, uint128 liq,
                         uint256 feeGlobal)
        internal returns (uint256 feeOdometer) {
        assertTickSize(bidTick, askTick);
        addBid(bidTick, liq);
        addAsk(askTick, liq);
        initLevel(midTick, bidTick, feeGlobal);
        initLevel(midTick, askTick, feeGlobal);
        feeOdometer = clockFeeOdometer(midTick, bidTick, askTick, feeGlobal);
    }

    function setTickSize (int24 tickSize) internal {
        require(tickSize >= 0 && tickSize < type(uint16).max);
        tickSize_ = uint16(tickSize);
    }

    
    function getTickSize() internal view returns (uint16) {
        return tickSize_;
    }

    function assertTickSize (int24 bidTick, int24 askTick) internal view {
        if (tickSize_ > 0) {
            require(bidTick % tickSize_ == 0, "D");
            require(askTick % tickSize_ == 0, "D");
        }
    }
    
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
        if (levels_[tick].feeOdometer_ == 0) {
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
        uint128 newLiq = LiquidityMath.addDelta(prevLiq, -int128(subLiq));
        
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
        uint128 newLiq = LiquidityMath.addDelta(prevLiq, -int128(subLiq));
        
        lvl.askLiq_ = newLiq;
        if (newLiq == 0 && lvl.bidLiq_ == 0) {
            forgetTick(tick);
            return true;
        }
        return false;
    }    

    
    function clockFeeOdometer (int24 currentTick, int24 lowerTick, int24 upperTick,
                               uint256 feeGlobal)
        internal view returns (uint256) {
        uint256 feeLower = pivotFeeBelow(lowerTick, currentTick, feeGlobal);
        uint256 feeUpper = pivotFeeBelow(upperTick, currentTick, feeGlobal);
        return feeUpper - feeLower;
    }

    function pivotFeeBelow (int24 lvlTick, int24 currentTick, uint256 feeGlobal)
        private view returns (uint256) {
        BookLevel storage lvl = levels_[lvlTick];
        return lvlTick <= currentTick ?
            lvl.feeOdometer_ :
            (feeGlobal - lvl.feeOdometer_);            
    }
}

