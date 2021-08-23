// SPDX-License-Identifier: Unlicensed

pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import './LowGasSafeMath.sol';
import './SafeCast.sol';
import './FullMath.sol';
import './FixedPoint96.sol';
import './LiquidityMath.sol';
import './CompoundMath.sol';
import './CurveMath.sol';

/* @title Curve roll library
 * @notice Provides functionality for rolling the price or up or down along
 *         a locally stable constant product liquidity curve. */
library CurveRoll {
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using LiquidityMath for uint128;
    using CompoundMath for uint256;
    using CurveMath for CurveMath.CurveState;
    using CurveMath for uint128;

    function rollLiq (CurveMath.CurveState memory curve, uint256 flow,
                      CurveMath.SwapAccum memory swap) internal pure {
        (int256 counterFlow, uint160 nextPrice) = deriveImpact(curve, flow, swap);
        int256 paidFlow = signFlow(flow, swap.cntx_);

        curve.priceRoot_ = nextPrice;
        swap.qtyLeft_ = swap.qtyLeft_.sub(flow);
        swap.paidBase_ = swap.paidBase_.add
            (swap.cntx_.inBaseQty_ ? paidFlow : counterFlow);
        swap.paidQuote_ = swap.paidQuote_.add
            (swap.cntx_.inBaseQty_ ? counterFlow : paidFlow);
    }
    
    function rollLiqRounded (CurveMath.CurveState memory curve, uint256 flow,
                             CurveMath.SwapAccum memory swap) internal pure {
        rollLiq(curve, flow, swap);
        shaveRoundDown(swap);
    }

    function shaveRoundDown (CurveMath.SwapAccum memory swap) private pure {
        if (isFlowInput(swap.cntx_)) {
            swap.qtyLeft_ = swap.qtyLeft_ - 1;
        }
        
        if (swap.paidQuote_ > 0) {
            swap.paidQuote_ = swap.paidQuote_ + 1;
        } else {
            swap.paidBase_ = swap.paidBase_ + 1;
        }
    }

    function deriveImpact (CurveMath.CurveState memory curve, uint256 flow,
                           CurveMath.SwapAccum memory swap) internal pure
        returns (int256 counterFlow, uint160 nextPrice) {
        uint128 liq = curve.activeLiquidity();
        uint256 reserve = liq.reserveAtPrice(curve.priceRoot_, swap.cntx_.inBaseQty_);
        nextPrice = deriveFlowPrice(curve.priceRoot_, reserve, flow, swap.cntx_);
        counterFlow = liq.deltaFlow(curve.priceRoot_, nextPrice, !swap.cntx_.inBaseQty_);
    }
    
    function deriveFlowPrice (uint160 price, uint256 reserve,
                              uint256 flowMagn, CurveMath.SwapFrame memory cntx)
        private pure returns (uint160) {
        int256 flow = signFlow(flowMagn, cntx);
        uint256 nextReserve = flow > 0 ? reserve.add(uint256(flow)) :
            reserve.sub(uint256(-flow));

        uint256 curvePrice = cntx.inBaseQty_ ?
            FullMath.mulDivTrapZero(price, nextReserve, reserve) :
            FullMath.mulDivTrapZero(price, reserve, nextReserve);
        if (curvePrice > TickMath.MAX_SQRT_RATIO) { return TickMath.MAX_SQRT_RATIO; }
        if (curvePrice < TickMath.MIN_SQRT_RATIO) { return TickMath.MIN_SQRT_RATIO; }
        return uint160(curvePrice);
    }

    function signFlow (uint256 flow, CurveMath.SwapFrame memory cntx)
        private pure returns (int256) {
        if (cntx.inBaseQty_ == cntx.isBuy_) {
            return int256(flow);
        } else {
            return -int256(flow);
        }
    }
    
    function isFlowInput (CurveMath.SwapFrame memory cntx) private pure returns (bool) {
        return cntx.inBaseQty_ == cntx.isBuy_;
    }

}
