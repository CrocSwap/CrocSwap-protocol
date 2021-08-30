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
    using CurveMath for CurveMath.SwapFrame;
    using CurveMath for uint128;

    /* @notice Applies a given swap flow onto a constant product AMM curve and adjusts
     *   the swap accumulators and curve price. The price target and flows are set
     *   at a point that guarantees incremental collateral safety. 
     *
     * @dev Note that this function does *NOT* check whether the curve is liquidity 
     *   stable through the swap impact. It's the callers job to make sure that the 
     *   impact doesn't cross through any tick barrier that knocks concentrated liquidity
     *   in/out. 
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
    function rollFlow (CurveMath.CurveState memory curve, uint256 flow,
                       CurveMath.SwapAccum memory swap) internal pure {        
        (uint256 counterFlow, uint160 nextPrice) = deriveImpact(curve, flow, swap);
        (int256 paidFlow, int256 paidCounter) = signFlow(flow, counterFlow, swap.cntx_);
        setCurvePos(curve, swap, nextPrice, paidFlow, paidCounter);
    }

    /* @notice Moves a curve to a pre-determined price target, and adjusts the swap flows
     *   as necessary to reach the target. The final curve will end at exactly that price,
     *   and the flows are set to guarantee incremental collateral safety.
     *
     * @dev Note that this function does *NOT* check whether the curve is liquidity 
     *   stable through the swap impact. It's the callers job to make sure that the 
     *   impact doesn't cross through any tick barrier that knocks concentrated liquidity
     *   in/out. 
     *
     * @param curve - The current state of the active liquidity curve. After calling
     *   this struct will be updated with the post-swap price. Note that none of the
     *   fee accumulator fields are adjusted. This function does *not* collect or apply
     *   liquidity fees. It's the callers responsibility to handle fees outside this
     *   call.
     * @param price - Price target that the curve will be re-pegged at.
     * @param swap - The in-progress swap object. The accumulator fields will be 
     *   incremented based on the swapped flow and its relevant impact. */
    function rollPrice (CurveMath.CurveState memory curve, uint160 price,
                        CurveMath.SwapAccum memory swap) internal pure {
        (uint256 flow, uint256 counterFlow) = deriveDemand(curve, price, swap);
        (int256 paidFlow, int256 paidCounter) = signFixed(flow, counterFlow, swap.cntx_);
        setCurvePos(curve, swap, price, paidFlow, paidCounter);
    }

    function setCurvePos (CurveMath.CurveState memory curve, 
                          CurveMath.SwapAccum memory swap, uint160 price,
                          int256 paidFlow, int256 paidCounter) private pure {
        uint256 spent = flowToSpent(paidFlow, swap.cntx_);
        swap.qtyLeft_ = spent >= swap.qtyLeft_ ? 0 :
            swap.qtyLeft_.sub(spent);
        swap.paidBase_ = swap.paidBase_.add
            (swap.cntx_.inBaseQty_ ? paidFlow : paidCounter);
        swap.paidQuote_ = swap.paidQuote_.add
            (swap.cntx_.inBaseQty_ ? paidCounter : paidFlow);        
        curve.priceRoot_ = price;
    }

    /* @notice Convert a signed paid flow to a decrement to apply to swap qty left. */
    function flowToSpent (int256 paidFlow, CurveMath.SwapFrame memory cntx)
        private pure returns (uint256) {
        int256 spent = cntx.isFlowInput() ? paidFlow : -paidFlow;
        if (spent < 0) { return 0; }
        return uint256(spent);
    }

    /* @notice Calculates the flow and counterflow associated with moving the constant
     *         product curve to a target price.
     * @dev    Both sides of the flow are rounded down at up to 2 wei of precision loss
     *         (see CurveMath.sol). The results should not be used directly without 
     *         buffering the counterflow in the direction of collateral support. */
     function deriveDemand (CurveMath.CurveState memory curve, uint160 price,
                           CurveMath.SwapAccum memory swap) private pure
        returns (uint256 flow, uint256 counterFlow) {
        uint128 liq = curve.activeLiquidity();
        uint256 baseFlow = liq.deltaBase(curve.priceRoot_, price);
        uint256 quoteFlow = liq.deltaQuote(curve.priceRoot_, price);
        if (swap.cntx_.inBaseQty_) {
            (flow, counterFlow) = (baseFlow, quoteFlow);
        } else {
            (flow, counterFlow) = (quoteFlow, baseFlow);
        }
    }

    /* @notice Given a fixed swap flow on a constant product AMM curve, calculates
     *   the final price and counterflow. This function assumes that the AMM curve is
     *   constant product stable through the impact range. It's the caller's 
     *   responsibility to check that we're not passing liquidity bump tick boundaries.
     *
     * @dev The fixed-point calculated price will be within one unit of precision from 
     *   the real-valued price give the swap flow. The counter flow is calculated off the
     *   rounded price (not the real valued price), because that's what the curves price 
     *   will finalize at, and where the collateral needs to support. The counter flow 
     *   always rounds in the direction of the pool. Hence applying the flow, counterflow
     *   and price from this function is guaranteed to be curve collateral safe. */
    function deriveImpact (CurveMath.CurveState memory curve, uint256 flow,
                           CurveMath.SwapAccum memory swap) private pure
        returns (uint256 counterFlow, uint160 nextPrice) {
        uint128 liq = curve.activeLiquidity();
        uint256 reserve = liq.reserveAtPrice(curve.priceRoot_, swap.cntx_.inBaseQty_);
        nextPrice = deriveFlowPrice(curve.priceRoot_, reserve, flow, swap.cntx_);
        counterFlow = !swap.cntx_.inBaseQty_ ?
            liq.deltaBase(curve.priceRoot_, nextPrice) :
            liq.deltaQuote(curve.priceRoot_, nextPrice);
    }

    /* @dev The end price is always rounded to the inside of the token making up the flow
     *   I.e. a buy in input/base tokens will round the price down, a buy in output/quote
     *   tokens will round up, a sell in input/quote rounds up, a buy in output/base 
     *   rounds down. This is because the magnitude of the flow tokens are fixed by the
     *   user's swap specification and can't be bumped to over-collateralize. Therefore
     *   we set the price in the direction that over-collateralizes the virtual reserves
     *   on the fixed flow. */
    function deriveFlowPrice (uint160 price, uint256 reserve,
                              uint256 flow, CurveMath.SwapFrame memory cntx)
        private pure returns (uint160) {
        uint256 nextReserve = cntx.isFlowInput() ?
            reserve.add(flow) : reserve.sub(flow);

        uint256 curvePrice = cntx.inBaseQty_ ?
            FullMath.mulDivTrapZero(price, nextReserve, reserve) :
            FullMath.mulDivTrapZero(price, reserve, nextReserve);

        if (priceRoundsUp(cntx)) {
            curvePrice = curvePrice + 1;
        }        

        if (curvePrice > TickMath.MAX_SQRT_RATIO) { return TickMath.MAX_SQRT_RATIO; }
        if (curvePrice < TickMath.MIN_SQRT_RATIO) { return TickMath.MIN_SQRT_RATIO; }
        return curvePrice.toUint160();
    }

    // To be conservative, round the curve precision to the inside of the price
    // move. That prevents us from inadvertantly crossing a fixed limit price.
    function priceRoundsUp (CurveMath.SwapFrame memory cntx) private pure returns (bool) {
        return cntx.isBuy_ != cntx.isFlowInput();
    }

    // Max round precision loss is 2 wei, but a 4 wei cushion provides extra margin
    // and is economically meaningless.
    int256 constant ROUND_PRECISION_WEI = 4;

    /* @notice Correctly assigns the signed direction to the unsigned flow and counter
     *   flow magnitudes that were previously computed for a fixed flow swap. Positive 
     *   sign implies the flow is being received by the pool, negative that it's being 
     *   received by the user. */
    function signFlow (uint256 flowMagn, uint256 counterMagn,
                        CurveMath.SwapFrame memory cntx)
        private pure returns (int256 flow, int256 counter) {
        (flow, counter) = signMagn(flowMagn, counterMagn, cntx);
        // Conservatively round directional counterflow in the direction of the pool's
        // collateral. Don't round swap flow because that's a fixed target. 
        counter = counter + ROUND_PRECISION_WEI;
    }

    /* @notice Same as signFixed, but used for the flow from a price target swap leg. */
    function signFixed (uint256 flowMagn, uint256 counterMagn,
                        CurveMath.SwapFrame memory cntx)
        private pure returns (int256 flow, int256 counter) {
        (flow, counter) = signMagn(flowMagn, counterMagn, cntx);
        // In a price target, bothsides of the flow are floating, and have to be rounded
        // in pool's favor to conservatively accomodate the price precision.
        flow = flow + ROUND_PRECISION_WEI;
        counter = counter + ROUND_PRECISION_WEI;
    }
    
    function signMagn (uint256 flowMagn, uint256 counterMagn,
                       CurveMath.SwapFrame memory cntx)
        private pure returns (int256 flow, int256 counter) {
        if (cntx.isFlowInput()) {
            (flow, counter) = (flowMagn.toInt256(), -(counterMagn.toInt256()));
        } else {
            (flow, counter) = (-(flowMagn.toInt256()), counterMagn.toInt256());
        }
        
        
    }
}
