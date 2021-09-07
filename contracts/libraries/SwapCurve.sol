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
import './CurveRoll.sol';

/* @title Swap Curve library.
 * @notice Library contains functionality for fully applying a swap directive to 
 *         a locally stable liquidty curve within the bounds of the stable range
 *         and in a way that accumulates fees onto the curve's liquidity. */
library SwapCurve {
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using SafeCast for uint256;
    using CurveMath for CurveMath.CurveState;
    using CurveAssimilate for CurveMath.CurveState;
    using CurveRoll for CurveMath.CurveState;

    /* @notice Applies the swap on to the liquidity curve, either fully exhausting
     *   the swap or reaching the concentrated liquidity bounds or the user-specified
     *   limit price. After calling the curve and swap objects will be updated with
     *   the swap price impact, the liquidity fees assimilated into the curve's ambient
     *   liquidity, and the swap accumulators incremented with the cumulative flows.
     * 
     * @param curve - The current in-range liquidity curve. After calling, price and
     *    fee accumulation will be adjusted based on the swap processed in this leg.
     * @param accum - The in-process swap to cross against the liquidity curve. After
     *    the call, the accumulator fields will be adjusted with the amount of flow
     *    processed on this leg. The swap may or may not be fully exhausted. Caller 
     *    should check qtyLeft_ field.
     *
     * @param bumpTick - The tick boundary, past which the constant product AMM 
     *    liquidity curve is no longer valid because liquidity gets knocked in or
     *    out. The curve will never move past this tick boundary in the call. Caller's
     *    responsibility is to set this parameter in the correct direction. I.e. buys
     *    should be the boundary from above and sells from below. Represneted as a
     *    24-bit tick index. (See TickMath.sol)
     *
     * @param swapLimit - The user-specified limit price on the swap. Like all prices
     *    in CrocSwap, this is represented as a 96-bit fixed point of the *square root*
     *    of the real price. Note that this the limit on the ending *curve price* not 
     *    the realized swap price. Because the swap fills liquidity up to this point, 
     *    the realized swap price will never be worse than this limitPrice. If 
     *    limitPrice is inside the starting curvePrice 0 quantity will execute. */
    function swapToLimit (CurveMath.CurveState memory curve,
                          CurveMath.SwapAccum memory accum,
                          int24 bumpTick, uint160 swapLimit) pure internal {
        uint160 limitPrice = determineLimit(bumpTick, swapLimit, accum.cntx_.isBuy_);
        bookExchFees(curve, accum, limitPrice);
        swapOverCurve(curve, accum, limitPrice);
    }

    /* @notice Bump the swap flows by 1 wei in favor of the pool to conservatively
     *    guard against any under-collateralization risk due to rounding effects
     *    in the swap calculations. */
    function padSwapFlows (CurveMath.SwapAccum memory swap) internal pure {
        swap.paidBase_ += 1;
        swap.paidQuote_ += 1;
        swap.paidProto_ -= 1;
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
        (uint256 liqFees, uint256 exchFees) = vigOverFlow(curve, accum, limitPrice);
        curve.assimilateLiq(liqFees, accum.cntx_.inBaseQty_);
        assignFees(liqFees, exchFees, accum);
    }

    function assignFees (uint256 liqFees, uint256 exchFees,
                         CurveMath.SwapAccum memory accum) pure private {
        uint256 totalFees = liqFees + exchFees;
        if (accum.cntx_.inBaseQty_) {
            accum.paidQuote_ = accum.paidQuote_.add(totalFees.toInt256());
        } else {
            accum.paidBase_ = accum.paidBase_.add(totalFees.toInt256());
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

    function vigOverFlow (CurveMath.CurveState memory curve,
                          CurveMath.SwapAccum memory swap,
                          uint160 limitPrice)
        internal pure returns (uint256 liqFee, uint256 protoFee) {
        uint256 flow = curve.calcLimitCounter(swap, limitPrice);
        (liqFee, protoFee) = vigOverFlow(flow, swap);
    }
    
    function vigOverFlow (uint256 flow, uint24 feeRate, uint8 protoProp)
        private pure returns (uint256 liqFee, uint256 protoFee) {
        uint128 FEE_BP_MULT = 100 * 100 * 100;
        uint256 totalFee = FullMath.mulDiv(flow, feeRate, FEE_BP_MULT);
        protoFee = protoProp == 0 ? 0 : totalFee / protoProp;
        liqFee = totalFee - protoFee;
    }

    function vigOverFlow (uint256 flow, CurveMath.SwapAccum memory swap)
        private pure returns (uint256, uint256) {
        return vigOverFlow(flow, swap.cntx_.feeRate_, swap.cntx_.protoCut_);
    }
}
