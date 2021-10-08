// SPDX-License-Identifier: Unlicensed                                                    

pragma solidity >=0.8.4;

import '../libraries/SafeCast.sol';
import '../libraries/CurveMath.sol';
import '../libraries/TickMath.sol';

import "hardhat/console.sol";

contract OracleHistorian {
    using TickMath for uint128;
    using CurveMath for CurveMath.CurveState;

    struct Checkpoint {
        uint32 time_;
        uint32 ambientGrowth_;
        int56 twapPriceSum_;
        int56 vwapPriceSum_;
        uint80 liqLots_;
    }

    struct History {
        uint64 nextIndex_;
        int24 lastTick_;
        Checkpoint[4294967296] series_;
    }

    function queryLength (bytes32 poolKey) public view returns (uint64) {
        return hists_[poolKey].nextIndex_;
    }

    function queryCheckpoint (bytes32 poolKey, uint64 seriesIdx) public view
        returns (Checkpoint memory) {
        return hists_[poolKey].series_[seriesIdx];
    }

    function isCrossEvent (bytes32 poolKey, int24 startTick,
                           int24 endTick) internal view
        returns (bool) {
        int24 startCluster = clusterTick(startTick);
        int24 endCluster = clusterTick(endTick);

        console.log("Cross-Event", uint24(startCluster), uint24(endCluster));
        if (startCluster == endCluster) {
            return false;
        } else if (endCluster - startCluster > 1 ||
                   startCluster - endCluster > 1) {
            return true;
        } else {
            int24 lastCluster = clusterTick(hists_[poolKey].lastTick_);
            console.log("Last cluster", uint24(lastCluster));
            return endCluster != lastCluster;
        }
    }
    
    function addCheckpoint (bytes32 poolKey, CurveMath.CurveState memory curve)
        internal {
        addCheckpoint(poolKey, curve, SafeCast.timeUint32());
    }

    function addCheckpoint (bytes32 poolKey, CurveMath.CurveState memory curve,
                            uint32 nowTime) internal {
        History storage hist = hists_[poolKey];
        int24 tick = curve.priceRoot_.getTickAtSqrtRatio();
        (uint64 writeIndex, uint64 priorIndex, uint64 nextIndex) =
            determineIndex(hist, nowTime);
        
        if (writeIndex == 0) {
            writeInit(hist.series_[0], curve, nowTime);
        } else {
            writeIncr(hist.series_[writeIndex],
                      hist.series_[priorIndex], curve, hist.lastTick_, nowTime);
        }

        hist.nextIndex_ = nextIndex;
        hist.lastTick_ = tick;
    }

    function writeInit (Checkpoint storage slot, CurveMath.CurveState memory curve,
                        uint32 nowTime) private {
        uint32 truncGrowth = uint32(curve.accum_.ambientGrowth_ >> 32);
        slot.time_ = nowTime;
        slot.ambientGrowth_ = truncGrowth;
        slot.twapPriceSum_ = 0;
        slot.vwapPriceSum_ = 0;
        slot.liqLots_ = castLiqLots(curve);
    }

    function writeIncr (Checkpoint storage slot, Checkpoint storage tail,
                        CurveMath.CurveState memory curve,
                        int24 tick, uint32 nowTime) private {
        console.log("WriteIncr", tick > 0, tick > 0 ? uint24(tick) : uint24(-tick));
        uint32 truncGrowth = uint32(curve.accum_.ambientGrowth_ >> 32);
        slot.time_ = nowTime;
        slot.ambientGrowth_ = truncGrowth;
        slot.twapPriceSum_ = safeAccum(tail.twapPriceSum_,
                                       nowTime - tail.time_, tick);
        slot.vwapPriceSum_ = safeAccum(tail.vwapPriceSum_,
                                       truncGrowth - tail.ambientGrowth_, tick);
        slot.liqLots_ = castLiqLots(curve);
    }

    function castLiqLots (CurveMath.CurveState memory curve) private pure
        returns (uint80) {
        uint96 lots = uint96(curve.activeLiquidity() >> 24);
        if (lots >= type(uint80).max) {
            lots = type(uint80).max;
        }
        return uint80(lots);
    }

    function safeAccum (int56 sum, uint32 w, int24 tick) internal pure returns (int56) {
        int64 term = int64(uint64(w)) * int64(tick);
        int64 total = int64(sum) + term;
        if (total > type(int56).min && total < type(int56).max) {
            return int56(total);
        } else {
            return int56(sum);
        }
    }

    function determineIndex (History storage hist, uint32 nowTime) view internal
        returns (uint64, uint64, uint64) {
        if (hist.nextIndex_ == 0) {
            return (0, 0, 1);
        } else {
            if (canStep(hist, nowTime)) {
                return (hist.nextIndex_, hist.nextIndex_-1, hist.nextIndex_+1);
            } else {
                return (hist.nextIndex_-1, hist.nextIndex_-2, hist.nextIndex_);
            }
        }
    }

    function canStep (History storage hist, uint32 nowTime) view private returns (bool) {
        bool atInit = hist.nextIndex_ == 1;
        if (atInit) { return true; }

        bool atMaxHist = hist.nextIndex_ >= hist.series_.length;
        if (atMaxHist) { return false; }
        
        uint32 lastTime = hist.series_[hist.nextIndex_-1].time_;
        bool newBlock = (nowTime > lastTime);
        return newBlock;
    }
    
    function clusterTick (int24 tick) private pure returns (int24) {
        return tick / NEIGHBOR_TICKS;
    }

    mapping(bytes32 => History) private hists_;
    int24 constant private NEIGHBOR_TICKS = 32;
}

