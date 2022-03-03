// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import './SafeCast.sol';
import './FixedPoint.sol';
import './LiquidityMath.sol';
import './CompoundMath.sol';
import './CurveMath.sol';

import "hardhat/console.sol";

/* @title Curve roll library
 * @notice Provides functionality for rolling swap flows onto a constant-product
 *         AMM liquidity curve. */
library CurveRoll {
    using SafeCast for uint256;
    using SafeCast for uint128;
    using LiquidityMath for uint128;
    using CompoundMath for uint256;
    using SafeCast for uint256;
    using CurveMath for CurveMath.CurveState;
    using CurveMath for uint128;

    /* @notice Applies a given flow onto a constant product AMM curve, adjusts the curve
     *   price, and outputs accumulator deltas on both sides.
     *
     * @dev Note that this function does *NOT* check whether the curve is liquidity 
     *   stable through the flow impact. It's the callers job to make sure that the 
     *   impact doesn't cross through any tick barrier that knocks concentrated liquidity
     *   in/out. 
     *
     * @param curve - The current state of the active liquidity curve. After calling
     *   this struct will be updated with the post-swap price. Note that none of the
     *   fee accumulator fields are adjusted. This function does *not* collect or apply
     *   liquidity fees. It's the callers responsibility to handle fees outside this
     *   call.
     * @param flow - The amount of tokens to swap on this leg. In certain cases this 
     *   number may be a fixed point estimate based on a price target. Collateral safety
     *   is guaranteed with up to 2 wei of precision loss.
     * @param inBaseQty - If true, the above flow applies to the base-side tokens in the
     *                    pair. If false, applies to the quote-side tokens.
     * @param isBuy - If true, the flows are paying base tokens to the pool and receiving
     *                quote tokens. (Hence pushing the price up.) If false, vice versa.
     * @param swapQty - The total quantity left on the swap across all legs. May or may
     *                  not be equal to flow, or could be left depending on whether this
     *                  leg will fill the entire quantity.
     *
     * @return baseFlow - The signed flow of the base-side tokens. Negative means the flow
     *              is being paid from the pool to the user. Positive means the flow is
     *              being paid from the user to the pool.
     * @return quoteFlow - The signed flow of the quote-side tokens.
     * @return qtyLeft - The amount of swapQty remaining after the flow from this leg is
     *                   processed. */
    function rollFlow (CurveMath.CurveState memory curve, uint128 flow,
                       bool inBaseQty, bool isBuy, uint128 swapQty)
        internal pure returns (int128, int128, uint128) {
        (uint128 counterFlow, uint128 nextPrice) = deriveImpact
            (curve, flow, inBaseQty, isBuy);
        (int128 paidFlow, int128 paidCounter) = signFlow
            (flow, counterFlow, inBaseQty, isBuy);
        return setCurvePos(curve, inBaseQty, isBuy, swapQty,
                           nextPrice, paidFlow, paidCounter);
    }

    /* @notice Moves a curve to a pre-determined price target, and calculates the flows
     *   as necessary to reach the target. The final curve will end at exactly that price
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
     * @param price - The target limit price that the curve is being rolled to. Defined
     *                as Q64.64 fixed point.
     * @param inBaseQty - If true, the above flow applies to the base-side tokens in the
     *                    pair. If false, applies to the quote-side tokens.
     * @param isBuy - If true, the flows are paying base tokens to the pool and receiving
     *                quote tokens. (Hence pushing the price up.) If false, vice versa.
     * @param swapQty - The total quantity left on the swap across all legs. May or may
     *                  not be equal to flow, or could be left depending on whether this
     *                  leg will fill the entire quantity.
     *
     * @return baseFlow - The signed flow of the base-side tokens. Negative means the flow
     *              is being paid from the pool to the user. Positive means the flow is
     *              being paid from the user to the pool.
     * @return quoteFlow - The signed flow of the quote-side tokens.
     * @return qtyLeft - The amount of swapQty remaining after the flow from this leg is
     *                   processed. */
    function rollPrice (CurveMath.CurveState memory curve, uint128 price,
                        bool inBaseQty, bool isBuy, uint128 swapQty)
        internal pure returns (int128, int128, uint128)  {
        (uint128 flow, uint128 counterFlow) = deriveDemand(curve, price, inBaseQty);
        (int128 paidFlow, int128 paidCounter) = signFixed
            (flow, counterFlow, inBaseQty, isBuy);
        return setCurvePos(curve, inBaseQty, isBuy, swapQty, price,
                           paidFlow, paidCounter);
    }

    /* @notice Called when a curve has reached its a  bump barrier. Because the 
     *   barrier occurs at the final price in the tick, we need to "shave the price"
     *   over into the next tick. The curve has kicked in liquidity that's only active
     *   below this price, and we need the price to reflect the correct tick. So we burn
     *   an economically meaningless amount of collateral token wei to shift the price 
     *   down by exactly one unit of precision into the next tick. */
    function shaveAtBump (CurveMath.CurveState memory curve,
                          bool inBaseQty, bool isBuy, uint128 swapLeft)
        pure internal returns (int128, int128, uint128) {
        uint128 burnDown = CurveMath.priceToTokenPrecision
            (curve.activeLiquidity(), curve.priceRoot_, inBaseQty);
        require(swapLeft > burnDown, "BD");
        
        if (isBuy) {
            return setShaveUp(curve, inBaseQty, burnDown);
        } else {
            return setShaveDown(curve, inBaseQty, burnDown);
        }
    }

    /* @notice After calculating a burn down amount of collateral, roll the curve over
     *         into the next tick below the current tick. */
    function setShaveDown (CurveMath.CurveState memory curve, bool inBaseQty,
                           uint128 burnDown) private pure
        returns (int128 paidBase, int128 paidQuote, uint128 burnSwap) {
        if (curve.priceRoot_ > TickMath.MIN_SQRT_RATIO) {
            curve.priceRoot_ -= 1;
        }
        return (0, burnDown.toInt128Sign(), !inBaseQty ? burnDown : 0);
    }

    /* @notice After calculating a burn down amount of collateral, roll the curve over
     *         into the next tick above the current tick. */
    function setShaveUp (CurveMath.CurveState memory curve, bool inBaseQty,
                         uint128 burnDown) private pure
        returns (int128 paidBase, int128 paidQuote, uint128 burnSwap) {
        if (curve.priceRoot_ < TickMath.MAX_SQRT_RATIO_LESS_ONE) {
            curve.priceRoot_ += 1;
        }
        return (burnDown.toInt128Sign(), 0, inBaseQty ? burnDown : 0);
    }

    /* @notice After previously calculating the denominated and counter-denominated flows,
     *         this function assigns those to the correct side of the pair and decrements
     *         the total swap quantity by the amount spent. */
    function setCurvePos (CurveMath.CurveState memory curve,
                          bool inBaseQty, bool isBuy, uint128 swapQty,
                          uint128 price, int128 paidFlow, int128 paidCounter)
        private pure returns (int128 paidBase, int128 paidQuote, uint128 qtyLeft) {
        uint128 spent = flowToSpent(paidFlow, inBaseQty, isBuy);
        
        if (spent >= swapQty) {
            qtyLeft = 0;
        } else {
            qtyLeft = swapQty - spent;
        }

        paidBase = (inBaseQty ? paidFlow : paidCounter);
        paidQuote = (inBaseQty ? paidCounter : paidFlow); 
        curve.priceRoot_ = price;
    }

    /* @notice Convert a signed paid flow to a decrement to apply to swap qty left. */
    function flowToSpent (int128 paidFlow, bool inBaseQty, bool isBuy)
        private pure returns (uint128) {
        int128 spent = (inBaseQty == isBuy) ? paidFlow : -paidFlow;
        if (spent < 0) { return 0; }
        return uint128(spent);
    }

    /* @notice Calculates the flow and counterflow associated with moving the constant
     *         product curve to a target price.
     * @dev    Both sides of the flow are rounded down at up to 2 wei of precision loss
     *         (see CurveMath.sol). The results should not be used directly without 
     *         buffering the counterflow in the direction of collateral support. */
    function deriveDemand (CurveMath.CurveState memory curve, uint128 price,
                           bool inBaseQty) private pure
        returns (uint128 flow, uint128 counterFlow) {
        uint128 liq = curve.activeLiquidity();
        uint128 baseFlow = liq.deltaBase(curve.priceRoot_, price);
        uint128 quoteFlow = liq.deltaQuote(curve.priceRoot_, price);
        if (inBaseQty) {
            (flow, counterFlow) = (baseFlow, quoteFlow);
        } else {
            (flow, counterFlow) = (quoteFlow, baseFlow);
            
        }
    }

    /* @notice Given a fixed swap flow on a cosntant product AMM curve, calculates
     *   the final price and counterflow. This function assumes that the AMM curve is
     *   constant product stable through the impact range. It's the caller's 
     *   responsibility to check that we're not passing liquidity bump tick boundaries.
     *
     * @dev The price and counter-flow guarantee collateral stability on the AMM curve.
     *   Because of fixed-point effects the price may be arbitarily rounded, but the 
     *   counter-flow will always be set correctly to match. The result of this function
     *   is based on the AMM curve being constant through the entire range. Note that 
     *   this function only calulcates a result it does *not* write into the Curve or 
     *   Swap structs.
     *
     * @param curve The constant-product AMM curve
     * @param flow  The fixed token flow from the side the swap is denominated in.
     * @param inBaseQty If true, the flow is denominated in base-side tokens.
     * @param isBuy If true, the flows are paying base tokens to the pool and receiving
     *              quote tokens.
     *
     * @return counterFlow The magnitude of token flow on the opposite side the swap
     *                     is denominated in. Note that this value is *not* signed. Also
     *                     note that this value is always rounded down. 
     * @return nextPrice   The ending price of the curve assuming the full flow is 
     *                     processed. Note that this value is *not* written into the 
     *                     curve struct. */
    function deriveImpact (CurveMath.CurveState memory curve, uint128 flow,
                           bool inBaseQty, bool isBuy) internal pure
        returns (uint128 counterFlow, uint128 nextPrice) {
        uint128 liq = curve.activeLiquidity();
        nextPrice = deriveFlowPrice(curve.priceRoot_, liq, flow, inBaseQty, isBuy);

        /* We calculate the counterflow exactly off the computed price. Ultimately safe
         * collateralization only cares about the price, not the contravening flow.
         * Therefore we always compute based on the final, rounded price, not from the
         * original fixed flow. */
        counterFlow = !inBaseQty ?
            liq.deltaBase(curve.priceRoot_, nextPrice) :
            liq.deltaQuote(curve.priceRoot_, nextPrice);
    }

    /* @dev The end price is always rounded to the inside of the flow token:
     *
     *       Flow   |   Dir   |  Price Roudning  | Loss of Precision
     *     ---------------------------------------------------------------
     *       Base   |   Buy   |     Down         |    1 wei
     *       Base   |   Sell  |     Down         |    1 wei
     *       Quote  |   Buy   |     Up           |   Arbitrary
     *       Quote  |   Sell  |     Up           |   Arbitrary
     * 
     *   This guarantees that the pool is adaquately collateralized given the flow of the
     *   fixed side. Because of the arbitrary roudning, it's critical that the counter-
     *   flow is computed using the exact price returned by this function, and not 
     *   independently. */
    function deriveFlowPrice (uint128 price, uint128 liq,
                              uint128 flow, bool inBaseQty, bool isBuy)
        private pure returns (uint128) {
        uint128 curvePrice = inBaseQty ?
            calcBaseFlowPrice(price, liq, flow, isBuy) :
            calcQuoteFlowPrice(price, liq, flow, isBuy);
        if (curvePrice >= TickMath.MAX_SQRT_RATIO) { return TickMath.MAX_SQRT_RATIO_LESS_ONE; }
        if (curvePrice < TickMath.MIN_SQRT_RATIO) { return TickMath.MIN_SQRT_RATIO; }
        return curvePrice;
    }

    /* Because the base flow is fixed, we want to always set the price in favor of 
     * base token over-collateralization. Upstream, we'll independently set quote token
     * flows based off the price calculated here. Since higher price increases base 
     * collateral, we round price down regardless of whether the fixed base flow is a 
     * buy or a sell. 
     *
     * This seems counterintuitive when base token is the output, but even then moving 
     * the price further down will increase the quote token input and over-collateralize
     * the base token. The max loss of precision is 1 unit of fixed-point price. */
    function calcBaseFlowPrice (uint128 price, uint128 liq, uint128 flow, bool isBuy)
        private pure returns (uint128) {
        if (liq == 0) { return type(uint128).max; }
        
        uint192 deltaCalc = FixedPoint.divQ64(flow, liq);
        if (deltaCalc > type(uint128).max) { return type(uint128).max; }
        uint128 priceDelta = uint128(deltaCalc);

        if (isBuy) {
            return price + priceDelta;
        } else {
            // unchecked is safe since if priceDelta == price - 1
            // price - (priceDelta + 1) == price - (price - 1 + 1) == 0 
            unchecked {
                if (priceDelta >= price) { return 0; }
                return price - (priceDelta + 1);
            }
        }
    }

    /* The same rounding logic as calcBaseFlowPrice applies, but because it's the 
     * opposite side we want to conservatively round the price *up*, regardless of 
     * whether it's a buy or sell. 
     * 
     * Calculating flow price for quote flow is more complex because the flow delta 
     * applies to the inverse of the price. So when calculating the inverse, we make 
     * sure to round in the direction that rounds up the final price. */
    function calcQuoteFlowPrice (uint128 price, uint128 liq, uint128 flow, bool isBuy)
        private pure returns (uint128) {
        // Since this is a term in the quotient rounding down, rounds up the final price
        uint128 invPrice = FixedPoint.recipQ64(price);
        // This is also a quotient term so we use this function's round down logic
        uint128 invNext = calcBaseFlowPrice(invPrice, liq, flow, !isBuy);
        if (invNext == 0) { return TickMath.MAX_SQRT_RATIO; }
        return FixedPoint.recipQ64(invNext) + 1;
    }


    // Max round precision loss on token flow is 2 wei, but a 4 wei cushion provides
    // extra margin and is economically meaningless.
    int128 constant ROUND_PRECISION_WEI = 4;

    /* @notice Correctly assigns the signed direction to the unsigned flow and counter
     *   flow magnitudes that were previously computed for a fixed flow swap. Positive 
     *   sign implies the flow is being received by the pool, negative that it's being 
     *   received by the user. */
    function signFlow (uint128 flowMagn, uint128 counterMagn,
                       bool inBaseQty, bool isBuy)
        private pure returns (int128 flow, int128 counter) {
        (flow, counter) = signMagn(flowMagn, counterMagn, inBaseQty, isBuy);
        // Conservatively round directional counterflow in the direction of the pool's
        // collateral. Don't round swap flow because that's a fixed target. 
        counter = counter + ROUND_PRECISION_WEI;
    }

    /* @notice Same as signFixed, but used for the flow from a price target swap leg. */
    function signFixed (uint128 flowMagn, uint128 counterMagn,
                        bool inBaseQty, bool isBuy)
        private pure returns (int128 flow, int128 counter) {
        (flow, counter) = signMagn(flowMagn, counterMagn, inBaseQty, isBuy);
        // In a price target, bothsides of the flow are floating, and have to be rounded
        // in pool's favor to conservatively accomodate the price precision.
        flow = flow + ROUND_PRECISION_WEI;
        counter = counter + ROUND_PRECISION_WEI;
    }

    /* @notice Takes an unsigned flow magntiude and correctly signs it based on the
     *         directiona and denomination of the flows. */
    function signMagn (uint128 flowMagn, uint128 counterMagn,
                       bool inBaseQty, bool isBuy)
        private pure returns (int128 flow, int128 counter) {
        
        if (inBaseQty == isBuy) {
            (flow, counter) = (flowMagn.toInt128Sign(), -counterMagn.toInt128Sign());
        } else {
            (flow, counter) = (-flowMagn.toInt128Sign(), counterMagn.toInt128Sign());
        }
        
        
    }
}
