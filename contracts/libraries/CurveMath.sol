// SPDX-License-Identifier: Unlicensed

pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import './LowGasSafeMath.sol';
import './SafeCast.sol';
import './FullMath.sol';
import './FixedPoint96.sol';
import './LiquidityMath.sol';
import './CompoundMath.sol';

/* @title Curve and swap math library
 * @notice Library that defines locally stable constant liquidity curves and
 *         swap struct, as well as functions to derive impact and aggregate 
 *         liquidity measures on these objects. */
library CurveMath {
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using LiquidityMath for uint128;
    using CompoundMath for uint256;

    /* All CrocSwap swaps occur along a locally stable constant-product AMM curve.
     * For large moves across tick boundaries, the state of this curve might change
     * as range-bound liquidity is kicked in or out of the currently active curve.
     * But for small moves within tick boundaries (or between tick boundaries with
     * no liquidity bumps), the curve behaves like a classic constant-product AMM.
     *
     * CrocSwap tracks two types of liquidity. 1) Ambient liquidity that is non-
     * range bound and remains active at all prices from zero to infinity, until 
     * removed by the staking user. 2) Concentrated liquidity that is tied to an 
     * arbitrary lower<->upper tick range and is kicked out of the curve when the
     * price moves out of range.
     *
     * In the CrocSwap model all collected fees are directly incorporated as additional
     * liquidity into the curve itself. (See CurveAssimilate.sol for more on the 
     * mechanics.) All accumulated fees are added as ambient-type liquidity, even those
     * fees that belong to the pro-rata share of the active concentrated liquidity.
     * This is because on an aggregate level, we can't break down the pro-rata share
     * of concentrated rewards to the potentially infinite concentrated range
     * possibilities.
     *
     * Because of this concentrated liquidity can be flatly represented as 1:1 with
     * contributed liquidity. Ambient liquidity, in contrast, deflates over time as
     * it accumulates rewards. Therefore it's represented in terms of seed amount,
     * i.e. the equivalent of 1 unit of ambient liquidity contributed at the inception
     * of the pool. As fees accumulate the conversion rate from seed to liquidity 
     * continues to increase. 
     *
     * Finally concentrated liquidity rewards are represented in terms of accumulated
     * ambient seeds. This automatically takes care of the compounding of ambient 
     * rewards compounded on top of concentrated rewards. */    
    struct CurveLiquidity {
        uint128 ambientSeed_;
        uint128 concentrated_;
    }

    /* @param ambientGrowth_ The cumulative growth rate (represented as 128-bit fixed
     *    point) of 1 ambient liquidity seed since the beggining of the pool.
     *    
     * @param concTokenGrowth_ The cumulative rewards growth rate (represented as 128-
     *   bit fixed point) of 1 unit of concentrated liquidity that was active since the
     *   beggining of the pool. */
    struct CurveFeeAccum {
        uint256 ambientGrowth_;
        uint256 concTokenGrowth_;
    }

    /* @param priceRoot_ The square root of the active price of the AMM curve 
     *   (represented in 96-bit fixed point). Stored as a square root to make fixed-
     *   point liquidity math linear. */
    struct CurveState {
        uint160 priceRoot_;
        CurveLiquidity liq_;
        CurveFeeAccum accum_;
    }

    /* @notice Represents the general context for an in-process swap being executed
     *    through the liquidity curve.
     * @param isBuy_ - Set to true if the swap is increasing the curve price-- that is 
     *     the user is paying base token and receiving quote token.
     * @param inBaseQty_ - Set to true if qty of the swap is represented in terms of 
     *     base token. Note that any combination with @isBuy_ is possible:
     *
     *                 isBuy    /   inBaseQty    /   Result
     *                   T              T              Buying with a fixed payment
     *                   T              F              Buying for a fixed receivable
     *                   T              T              Selling for a fixed payment
     *                   T              F              Selling with a fixed payment
     *
     * @param feeRate_ - The exchange fee of the pool represented in hundreths of a 
     *     basis point (i.e. 0.0001%) applied to the notional traded.
     * @param protoCut_ - The proportion of the exchange fee that accumulates to the 
     *     protocol (instead of the liquidity providers). Represnted as an integer N for 
     *     which 1/N of the fee goes to the protocol. (If N=0, then none of the fee goes
     *     to the protocol. */
    struct SwapFrame {
        bool isBuy_;
        bool inBaseQty_;
        uint24 feeRate_;
        uint8 protoCut_;
    }

    /* @notice Represents the accumulated state of an in-progress swap being executed
     *    against the liquidity curve. The swap could be none, partially or fully 
     *    processed
     * @param qtyLeft_ - The total amount of notional left remaining unfilled in the
     *    swap. (Denominated on the side from inBaseQty_ (see above comments))
     * @param paidBase_ - The total accumulated number of base tokens filled by the swap.
     *    Negative represents tokens paid from the pool to the user. Positive vice versa.
     * @param paidBase_ - The total accumulated number of quote tokens filled by swap.
     *    Negative represents tokens paid from the pool to the user. Positive vice versa.
     * @param paidProto_ - The total amount of tokens collected in the form of protocol
     *    fees. (Denominated on the side from inBaseQty_ (see above comments)) */
    struct SwapAccum {
        uint256 qtyLeft_;
        int256 paidBase_;
        int256 paidQuote_;
        uint256 paidProto_;
        SwapFrame cntx_;
    }

    
    /* @notice Calculates the total scalar amount of liquidity currently active on the 
     *    curve.
     * @param curve - The currently active liqudity curve state. Remember this curve 
     *    state is only known valid within the current tick.
     * @return - The total scalar liquidity. Equivalent to sqrt(X*Y) in a constant-
     *           product AMM. */
    function activeLiquidity (CurveState memory curve) internal pure returns (uint128) {
        uint128 ambient = CompoundMath.inflateLiqSeed
            (curve.liq_.ambientSeed_, curve.accum_.ambientGrowth_);
        return LiquidityMath.addDelta(ambient, curve.liq_.concentrated_);
    }

    /* @notice Similar to calcLimitFlows(), except returns the max possible flow in the
     *   *opposite* direction. I.e. is inBaseQty_ is True, returns the quote token flow
     *   for the swap. */
    function calcLimitCounter (CurveState memory curve, SwapAccum memory swap,
                               uint160 limitPrice) internal pure returns (uint256) {
        bool isBuy = limitPrice > curve.priceRoot_;
        uint256 denomFlow = calcLimitFlows(curve, swap, limitPrice);
        return invertFlow(activeLiquidity(curve), curve.priceRoot_,
                          denomFlow, isBuy, swap.cntx_.inBaseQty_);
    }

    /* @notice Calculates the total quantity of tokens that can be swapped on the AMM
     *   curve until either 1) the limit price is reached or 2) the swap fills its 
     *   entire remaining quantity.
     *
     * @dev This function does *NOT* account for the possibility of concentrated liquidity
     *   being knocked in/out as the price on the AMM curve moves across tick boundaries.
     *   It's the responsibility of the caller to properly check whether the limit price
     *   is within the bounds of the locally stable curve.
     *
     * @param curve - The current state of the liquidity curve. No guarantee that it's
     *   liquidity stable through the entire limit range (see @dev above). Note that this
     *   function does *not* update the curve struct object.    
     * @param swap - The swap against which we want to calculate the limit flow.
     * @param limitPrice - The highest (lowest) acceptable ending price of the AMM curve
     *   for a buy (sell) swap. Represented as 96-bit fixed point. 
     *
     * @return - The maximum executable swap flow (rounded down to the next integer).
     *           Denominated on the token side based fro swap.cntx_.inBaseQty_. Will
     *           always return unsigned magnitude regardless of the direction. User
     *           can easily determine based on swap context. */
    function calcLimitFlows (CurveState memory curve, SwapAccum memory swap,
                             uint160 limitPrice) internal pure returns (uint256) {
        uint256 limitFlow = calcLimitFlows(curve, swap.cntx_.inBaseQty_, limitPrice);
        return limitFlow > swap.qtyLeft_ ? swap.qtyLeft_ : limitFlow;
    }
    
    function calcLimitFlows (CurveState memory curve, bool inBaseQty,
                             uint160 limitPrice) private pure returns (uint256) {
        uint128 liq = activeLiquidity(curve);
        return inBaseQty ?
            limitBaseDelta(liq, curve.priceRoot_, limitPrice) :
            limitQuoteDelta(liq, limitPrice, curve.priceRoot_);
    }

    function limitBaseDelta (uint128 liq, uint160 price, uint160 limitPrice)
        private pure returns (uint256) {
        uint160 priceDelta = limitPrice > price ?
            limitPrice - price : price - limitPrice;
        return reserveAtPrice(liq, priceDelta, true);
    }

    function limitQuoteDelta (uint128 liq, uint160 price, uint160 limitPrice)
        private pure returns (uint256) {
        uint160 priceDelta = limitPrice > price ?
            limitPrice - price : price - limitPrice;
        uint256 partTerm = FullMath.mulDiv(liq, priceDelta, price);
        return FullMath.mulDiv(partTerm, FixedPoint96.Q96, limitPrice);
    }

    /* @notice Returns the amount of virtual reserves give the price and liquidity of the
     *   constant-product liquidity curve.
     * @dev The actual pool probably holds significantly less collateral because of the 
     *   use of concentrated liquidity. 
     * 
     * @param liq - The total active liquidity in AMM curve. Represented as sqrt(X*Y)
     * @param price - The current active (square root of) price of the AMM curve. 
     *                 represnted as 96-bit fixed point.
     * @param inBaseQty - The side of the pool to calculate the virtual reserves for.
     *
     * @returns The virtual reserves of the token (rounded down to nearest integer). 
     *   Equivalent to the amount of tokens that would be held for an equivalent 
     *   classical constant- product AMM without concentrated liquidity. */
    function reserveAtPrice (uint128 liq, uint160 price, bool inBaseQty)
        internal pure returns (uint256) {
        return inBaseQty ?
            FullMath.mulDiv(liq, price, FixedPoint96.Q96) :
            FullMath.mulDiv(liq, FixedPoint96.Q96, price);
    }

    /* @notice Calculates the total tokens that would have to be swapped to move
     *    a constant product AMM curve from one price to another.
     *
     * @dev Note that this assumes the curve is liquidity stable across the entire
     *   range. It's the callers responsibility to check whether the price range
     *   would cross a concentrated liquidity tick bump, which would invalidate
     *   the result.
     *
     * @param liq - The total liquidity (in sqrt(X*Y)) active in the curve. 
     * @param startPrice - The current active price of the curve.
     * @param targetPrice - The assumed ending price of the curve.
     * @param inBaseQty - Whether to represent the result in base or quote tokens.
     *
     * @return The flow of tokens that would have to be swapped to move the liquidity
     *    curve to the targetPrice. Positive implies pools receives tokens, and negative
     *    that the pool would pay tokens. Because of rounding this can be +/- 1 of the
     *    real valued answer. */
    function deltaFlow (uint128 liq, uint160 startPrice, uint160 targetPrice,
                        bool inBaseQty)
        internal pure returns (int256) {
        uint256 initReserve = reserveAtPrice(liq, startPrice, inBaseQty);
        uint256 endReserve = reserveAtPrice(liq, targetPrice, inBaseQty);
        return (initReserve > endReserve) ?
            -int256(initReserve - endReserve) :
            int256(endReserve - initReserve);
    }

    function invertFlow (uint128 liq, uint160 price, uint256 denomFlow,
                         bool isBuy, bool inBaseQty) private pure returns (uint256) {
        uint256 invertReserve = reserveAtPrice(liq, price, !inBaseQty);
        uint256 initReserve = reserveAtPrice(liq, price, inBaseQty);
        
        uint256 endReserve = (isBuy == inBaseQty) ?
            initReserve.add(denomFlow) : initReserve.sub(denomFlow);
        if (endReserve == 0) { return type(uint128).max; }
        
        uint256 endInvert = FullMath.mulDivTrapZero(liq, liq, endReserve);
        return endInvert > invertReserve ?
            endInvert - invertReserve : invertReserve - endInvert;
    }
}
