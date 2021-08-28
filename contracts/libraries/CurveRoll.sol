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
 * @notice Provides functionality for rolling swap flows onto a constant-product
 *         AMM liquidity curve. */
library CurveRoll {
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using SafeCast for uint256;
    using LiquidityMath for uint128;
    using CompoundMath for uint256;
    using CurveMath for CurveMath.CurveState;
    using CurveMath for uint128;

    /* @notice Applies a given swap flow onto a constant product AMM curve and adjusts
     *   the swap accumulator. Note that this function does *NOT* check whether the 
     *   curve is liquidity stable through the swap impact. It's the callers job to make
     *   sure that the impact doesn't cross through any tick barrier that knocks 
     *   concentrated liquidity in/out. 
     *
     * @dev In certain cases the flow target may be derived from a fixed price target.
     *   in this case, we have to support over-collaterization of the swap to account
     *   for loss of precision. This function buffers swap call with up to 8 wei of 
     *   collateral which is economically meaningless, but accounts for the necessary
     *   fixed point round down in flow. (See CurveMath calcLimitFlow())
     *
     * @param curve - The current state of the active liquidity curve. After calling
     *   this struct will be updated with the post-swap price. Note that none of the
     *   fee accumulator fields are adjusted. This function does *not* collect or apply
     *   liquidity fees. It's the callers responsibility to handle fees outside this
     *   call.
     * @param flow - The amount of tokens to swap on this leg. Denominated in quote or
     *   base tokens based on the swap object context. In certain cases this number
     *   may be a fixed point estimate based on a price target. Collateral safety
     *   is guaranteed with up to 2 wei of precision loss.
     * @param swap - The in-progress swap object. The accumulator fields will be 
     *   incremented based on the swapped flow and its relevant impact. */
    function rollLiq (CurveMath.CurveState memory curve, uint256 flow,
                      CurveMath.SwapAccum memory swap) internal pure {
        rollLiqPrecise(curve, flow, swap);
        shaveRoundDown(curve, swap);
    }

    /* @notice Calculates the precise curve price and swap flows, but not directly 
     *   consumable because it doesn't account for round-down loss of collateral
     *   precision from upstream flow calculations. */
    function rollLiqPrecise (CurveMath.CurveState memory curve, uint256 flow,
                             CurveMath.SwapAccum memory swap) private pure {        
        (int256 counterFlow, uint160 nextPrice) = deriveImpact(curve, flow, swap);
        int256 paidFlow = signFlow(flow, swap.cntx_);

        curve.priceRoot_ = nextPrice;
        swap.qtyLeft_ = swap.qtyLeft_.sub(flow);
        swap.paidBase_ = swap.paidBase_.add
            (swap.cntx_.inBaseQty_ ? paidFlow : counterFlow);
        swap.paidQuote_ = swap.paidQuote_.add
            (swap.cntx_.inBaseQty_ ? counterFlow : paidFlow);
    }

    /* @notice Bumps both sides of the swap flow in favor of the pool to nuke any fixed
     *   point rounding that could under-collateralize. */
    function shaveRoundDown (CurveMath.CurveState memory curve,
                             CurveMath.SwapAccum memory swap) private pure {
        (uint128 baseShave, uint128 quoteShave) = sizePrecisionBuffer(curve, swap);
        
        uint256 flowShave = swap.cntx_.inBaseQty_ ? baseShave : quoteShave;
        // In very rare corner cases, the swap may demand an economically
        // meaningless amount more token wei than what the user specified. They can
        // always reject this condition at the time of settlement callback.
        swap.qtyLeft_ = swap.qtyLeft_ > flowShave ?
            swap.qtyLeft_ - flowShave : 0;
        
        swap.paidQuote_ = swap.paidQuote_ + quoteShave;
        swap.paidBase_ = swap.paidBase_ + baseShave;
    }

    /* @dev Calculates a conservative upper bound of token bound to guarantee collateral
     *    safety with regards to any fixed-point rounding affects on either token flow
     *    or price precision. */
    function sizePrecisionBuffer (CurveMath.CurveState memory curve,
                                  CurveMath.SwapAccum memory swap)
        private pure returns (uint128 baseToken, uint128 quoteToken) {
        /* Give us enough room to account for the 2 wei of round down allowed by the
         * rollDown() function's contract on the flow input(), and another wei of round
         * down onthe counter flow calculation in deriveImpact(). Then double that to
         * be conservative, because 8 wei is virtually meaningless. */
        uint128 TOKEN_PRECISION = 8;

        // Price is rounded to the inside of the swap direction.
        bool priceMovesUp = swap.cntx_.isBuy_;
        bool priceRoundsUp = !priceMovesUp;
        uint128 pricePrecision = CurveMath.priceToTokenPrecision
            (curve.activeLiquidity(), curve.priceRoot_, priceRoundsUp)
            .toUint128();

        // Price collateral is provided on the side of the virtual reserves being
        // rounded towards.
        if (priceRoundsUp) {
            (baseToken,quoteToken) = (TOKEN_PRECISION + pricePrecision, TOKEN_PRECISION);
        } else {
            (baseToken,quoteToken) = (TOKEN_PRECISION, TOKEN_PRECISION + pricePrecision);
        }
    }

    /* @dev counterFlow is always rounded down to the nearest integer. nextPrice is
     *   rounded to the minimum precision unit (2^-96) of the inside of the direction
     *   of the swap. */
    function deriveImpact (CurveMath.CurveState memory curve, uint256 flow,
                           CurveMath.SwapAccum memory swap) private pure
        returns (int256 counterFlow, uint160 nextPrice) {
        uint128 liq = curve.activeLiquidity();
        uint256 reserve = liq.reserveAtPrice(curve.priceRoot_, swap.cntx_.inBaseQty_);
        nextPrice = deriveFlowPrice(curve.priceRoot_, reserve, flow, swap.cntx_);
        counterFlow = liq.deltaFlow(curve.priceRoot_, nextPrice,
                                    !swap.cntx_.inBaseQty_);
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
        
        // To be conservative, round the curve precision to the inside of the price
        // move. That prevents us from inadvertantly crossing a fixed limit price.
        return curvePrice < price ?
            uint160(curvePrice) + 1 :
            uint160(curvePrice);
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
