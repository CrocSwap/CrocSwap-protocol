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
        
        // limitPrice is still valid even though curve has move from ingesting liquidity
        // fees in bookExchFees(). That's because the collected fees are mathematically
        // capped at a fraction of the flow necessary to reach limitPrice. See
        // bookExchFees() comments. (This is also why we book fees before swapping, so we
        // don't run into the limitPrice when trying to ingest fees.)
        swapOverCurve(curve, accum, limitPrice);
    }

    /* @notice Calculates the exchange fee given a swap directive and limitPrice. Note 
     *   this assumes the curve is constant-product without liquidity bumps through the
     *   whole range. Don't use this function if you're unable to guarantee that the AMM
     *   curve is locally stable through the price impact.
     *
     * @param curve The current state of the AMM liquidity curve. Must be stable without
     *              liquidity bumps through the price impact.
     * @param swap  The swap to be executed. This function will *not* mutate any 
     *              accumulator fields on the swap. 
     * @param limitPrice The limit price (in square root 96-bit fixed point precision)
     * @return liqFee The total fee accumulated to liquidity providers in the pool (in 
     *                the opposite side tokens of the swap denomination).
     * @return protoFee The total fee accumulated to the CrocSwap protocol. */
    function vigOverFlow (CurveMath.CurveState memory curve,
                          CurveMath.SwapAccum memory swap,
                          uint160 limitPrice)
        internal pure returns (uint256 liqFee, uint256 protoFee) {
        uint256 flow = curve.calcLimitCounter(swap, limitPrice);
        (liqFee, protoFee) = vigOverFlow(flow, swap);
    }

    function swapOverCurve (CurveMath.CurveState memory curve,
                            CurveMath.SwapAccum memory accum,
                            uint160 limitPrice) pure private {
        uint256 realFlows = curve.calcLimitFlows(accum, limitPrice);
        bool hitsLimit = realFlows < accum.qtyLeft_;

        if (hitsLimit) {
            curve.rollPrice(limitPrice, accum);
        } else {
            curve.rollFlow(realFlows, accum);
        }
        assertEndStable(curve, accum, limitPrice);
    }
    
    /* @dev In rare corner cases, swap can result in a corrupt end state. This occurs
     *   when the swap flow lands within a wei or two of the limit price boundary. The
     *   corrupt condition can be reached by multiple paths, but always results in 
     *   simultaneously hitting the limit and exactly exhausting the swap's liquidity.
     *   The problem is upstream logic will think the swap is complete, fail to knock in
     *   new liquidity and corrupt the state of the book. Since this is so astronomically
     *   rare, just crash the transaction. */
    function assertEndStable (CurveMath.CurveState memory curve,
                              CurveMath.SwapAccum memory swap,
                              uint160 limitPrice) pure private {
        bool insideLimit = swap.cntx_.isBuy_ ?
            curve.priceRoot_ < limitPrice :
            curve.priceRoot_ > limitPrice;
        bool hasRemaining = swap.qtyLeft_ > 0;
        require(hasRemaining != insideLimit, "RB");
    }

    /* @notice Determines an effective limit price given the combination of swap-
     *    specified limit, tick liquidity bump boundary on the locally stable AMM curve,
     *    and the numerical boundaries of the price field. Always picks the value that's
     *    most to the inside of the swap direction. */
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

    /* @notice Calculates exchange fee charge based off an estimate of the predicted
     *         order flow on this leg of the swap.
     * 
     * @dev    Note that the process of collecting the exchange fee itself alters the
     *   structure of the curve, because those fees assimilate as liquidity into the 
     *   curve new liquidity. As such the flow used to pro-rate fees is only an estimate
     *   of the actual flow that winds up executed. This means that fees are not exact 
     *   relative to realized flows. But because fees only have a small impact on the 
     *   curve, they'll tend to be very close. Getting fee exactly correct doesn't 
     *   matter, and either over or undershooting is fine from a collateral stability 
     *   perspective. */
    function bookExchFees (CurveMath.CurveState memory curve,
                           CurveMath.SwapAccum memory accum,
                           uint160 limitPrice) pure private {
        (uint256 liqFees, uint256 exchFees) = vigOverFlow(curve, accum, limitPrice);
        assignFees(liqFees, exchFees, accum);
        
        /* We can guarantee that the price shift associated with the liquidity
         * assimilation is safe. The limit price boundary is by definition within the
         * tick price boundary of the locally stable AMM curve (see determineLimit()
         * function). The liquidity assimilation flow is mathematically capped within 
         * the limit price flow, because liquidity fees are a small fraction of swap
         * flows. */
        curve.assimilateLiq(liqFees, accum.cntx_.inBaseQty_);
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
