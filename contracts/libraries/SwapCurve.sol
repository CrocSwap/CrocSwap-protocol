// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.7.6;
pragma experimental ABIEncoderV2;

import './FullMath.sol';
import './TickMath.sol';
import './FixedPoint96.sol';
import './LiquidityMath.sol';
import './SafeCast.sol';
import './LowGasSafeMath.sol';
import './CurveMath.sol';
import './CurveAssimilate.sol';

library SwapCurve {
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using CurveMath for CurveMath.CurveState;
    using CurveAssimilate for CurveMath.CurveState;
    
    function swapToLimit (CurveMath.CurveState memory curve,
                          CurveMath.SwapAccum memory accum,
                          int24 bumpTick, uint160 swapLimit) pure internal {
        uint160 limitPrice = determineLimit(bumpTick, swapLimit, accum.cntx_.isBuy_);
        bookExchFees(curve, accum, limitPrice);
        swapOverCurve(curve, accum, limitPrice);
    }

    function determineLimit (int24 bumpTick, uint160 limitPrice, bool isBuy)
        pure private returns (uint160) {
        uint160 bounded = boundLimit(bumpTick, limitPrice, isBuy);
        if (bounded < TickMath.MIN_SQRT_RATIO)  return TickMath.MIN_SQRT_RATIO;
        if (bounded > TickMath.MAX_SQRT_RATIO)  return TickMath.MAX_SQRT_RATIO;
        return bounded;
    }

    function boundLimit (int24 bumpTick, uint160 limitPrice, bool isBuy)
        pure private returns (uint160) {
        if (bumpTick <= TickMath.MIN_TICK || bumpTick >= TickMath.MAX_TICK) {
            return limitPrice;
        } else if (isBuy) {
            uint160 bumpPrice = TickMath.getSqrtRatioAtTick(bumpTick);
            return bumpPrice < limitPrice ? bumpPrice : limitPrice;
        } else {
            uint160 bumpPrice = TickMath.getSqrtRatioAtTick(bumpTick+1) - 1;
            return bumpPrice > limitPrice ? bumpPrice : limitPrice;
        }
    }

    function bookExchFees (CurveMath.CurveState memory curve,
                           CurveMath.SwapAccum memory accum,
                           uint160 limitPrice) pure private {
        (uint256 liqFees, uint256 exchFees) =
            CurveMath.vigOverFlow(curve, accum, limitPrice);
        curve.assimilateLiq(liqFees, accum.cntx_.inBaseQty_);
        assignFees(liqFees, exchFees, accum);
    }

    function assignFees (uint256 liqFees, uint256 exchFees,
                         CurveMath.SwapAccum memory accum) pure private {
        uint256 totalFees = liqFees + exchFees;
        if (accum.cntx_.inBaseQty_) {
            accum.paidQuote_ = accum.paidQuote_.add(int256(totalFees));
        } else {
            accum.paidBase_ = accum.paidBase_.add(int256(totalFees));
        }
        accum.paidProto_ = accum.paidProto_.add(exchFees);
    }

    function swapOverCurve (CurveMath.CurveState memory curve,
                            CurveMath.SwapAccum memory accum,
                            uint160 limitPrice) pure private {
        uint256 realFlows = curve.calcLimitFlows(accum, limitPrice);
        bool hitsLimit = realFlows < accum.qtyLeft_;

        if (hitsLimit) {
            curve.rollLiqRounded(realFlows, accum);
            curve.priceRoot_ = limitPrice;
        } else {
            curve.rollLiq(realFlows, accum);
        }
    }
}
