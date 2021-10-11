// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import './LowGasSafeMath.sol';
import './SafeCast.sol';
import './FixedPoint.sol';
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
    using SafeCast for uint256;

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
     *   beggining of the pool.
     *
     * @dev To be conservative with collateral these growth rates should always be
     *      rounded down from their real-value results. Some minor lower-bound 
     *      approximation is find, since all it will result in is slightly smaller 
     *      reward payouts. */
    struct CurveFeeAccum {
        uint64 ambientGrowth_;
        uint64 concTokenGrowth_;
    }

    /* @param priceRoot_ The square root of the active price of the AMM curve 
     *   (represented in 96-bit fixed point). Stored as a square root to make fixed-
     *   point liquidity math linear. */
    struct CurveState {
        uint128 priceRoot_;
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
     *                   F              T              Selling for a fixed payment
     *                   F              F              Selling with a fixed payment
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
     * @param paidQuote_ - The total accumulated number of quote tokens filled by swap.
     *    Negative represents tokens paid from the pool to the user. Positive vice versa.
     * @param paidProto_ - The total amount of tokens collected in the form of protocol
     *    fees. (Denominated on the side from inBaseQty_ (see above comments)) */
    struct SwapAccum {
        uint128 qtyLeft_;
        int128 paidBase_;
        int128 paidQuote_;
        uint128 paidProto_;
        SwapFrame cntx_;
    }

    
    /* @notice Calculates the total scalar amount of liquidity currently active on the 
     *    curve.
     * @dev    Result always rounds down from the real value, *assuming* that the fee
     *         accumulation fields are conservative lower-bound rounded.
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
     *   for the swap.
     *
     * @dev The fixed-point result approximates the real valued formula with close but
     *   directionally unpredicable precision. It could be slightly above or slightly
     *   below. In the case of zero flows this could be substantially over. This 
     *   function should not be used in any context with strict directional boundness 
     *   requirements. */
    function calcLimitCounter (CurveState memory curve, uint128 swapQty, bool inBaseQty,
                               uint128 limitPrice) internal pure returns (uint128) {
        bool isBuy = limitPrice > curve.priceRoot_;
        uint128 denomFlow = calcLimitFlows(curve, swapQty, inBaseQty, limitPrice);
        return invertFlow(activeLiquidity(curve), curve.priceRoot_,
                          denomFlow, isBuy, inBaseQty);
    }

    /* @notice Calculates the total quantity of tokens that can be swapped on the AMM
     *   curve until either 1) the limit price is reached or 2) the swap fills its 
     *   entire remaining quantity.
     *
     * @dev This function does *NOT* account for the possibility of concentrated liq
     *   being knocked in/out as the price on the AMM curve moves across tick boundaries.
     *   It's the responsibility of the caller to properly check whether the limit price
     *   is within the bounds of the locally stable curve.
     *
     * @dev As long as CurveState's fee accum fields are conservatively lower bounded,
     *   and as long as limitPrice is accurate, then this function rounds down from the
     *   true real value. At most this round down loss of precision is tightly bounded at
     *   2 wei. (See comments in deltaPriceQuote() function)
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
    function calcLimitFlows (CurveState memory curve, uint128 swapQty,
                             bool inBaseQty, uint128 limitPrice)
        internal pure returns (uint128) {
        uint128 limitFlow = calcLimitFlows(curve, inBaseQty, limitPrice);
        return limitFlow > swapQty ? swapQty : limitFlow;
    }
    
    function calcLimitFlows (CurveState memory curve, bool inBaseQty,
                             uint128 limitPrice) private pure returns (uint128) {
        uint128 liq = activeLiquidity(curve);
        return inBaseQty ?
            deltaBase(liq, curve.priceRoot_, limitPrice) :
            deltaQuote(liq, limitPrice, curve.priceRoot_);
    }

    /* @notice Calculates the change to base token reserves associated with a price
     *   move along an AMM curve of constant liquidity.
     *
     * @dev Result is a tight lower-bound for fixed-point precision. Meaning if the
     *   the returned limit is X, then X will be inside the limit price and (X+1)
     *   will be outside the limit price. */
    function deltaBase (uint128 liq, uint128 priceX, uint128 priceY)
        internal pure returns (uint128) {
        uint128 priceDelta = priceX > priceY ?
            priceX - priceY : priceY - priceX;
        return reserveAtPrice(liq, priceDelta, true);
    }

    /* @notice Calculates the change to quote token reserves associated with a price
     *   move along an AMM curve of constant liquidity.
     * 
     * @dev Result is almost always within a fixed-point precision unit from the true
     *   real value. However in certain very rare cases, the result could be up to 2
     *   wei below the true real value. Caller should account for this upstream. */
    function deltaQuote (uint128 liq, uint128 price, uint128 limitPrice)
        internal pure returns (uint128) {
        // For purposes of downstream calculations, we make sure that limit price is
        // larger. End result is symmetrical anyway
        if (limitPrice > price) {
            return calcQuoteDelta(liq, limitPrice, price);
        } else {
            return calcQuoteDelta(liq, price, limitPrice);
        }
    }

    /* The formula calculated is
     *    F = L * d / (P*P')
     *   (where F is the flow to the limit price, where L is liquidity, d is delta, 
     *    P is price and P' is limit price)
     *
     * Calculating this requires two stacked mulDiv. To meet the function' contract
     * we need to compute the result with tight fixed point boundaries at or below
     * 2 wei to conform to the function's contract.
     * 
     * The fixed point calculation of flow is
     *    F = mulDiv(mulDiv(...)) = FR - FF
     *  (where F is the fixed point result of the formula, FR is the true real valued
     *   result with inifnite precision, FF is the loss of precision fractional round
     *   down, mulDiv(...) is a fixed point mulDiv call of the form X*Y/Z)
     *
     * The individual fixed point terms are
     *    T1 = mulDiv(X1, Y1, Z1) = T1R - T1F
     *    T2 = mulDiv(T1, Y2, Z2) = T2R - T2F
     *  (where T1 and T2 are the fixed point results from the first and second term,
     *   T1R and T2R are the real valued results from an infinite precision mulDiv,
     *   T1F and T2F are the fractional round downs, X1/Y1/Z1/Y2/Z2 are the arbitrary
     *   input terms in the fixed point calculation)
     *
     * Therefore the total loss of precision is
     *    FF = T2F + T1F * T2R/T1
     *
     * To guarantee a 2 wei precision loss boundary:
     *    FF <= 2
     *    T2F + T1F * T2R/T1 <= 2
     *    T1F * T2R/T1 <=  1      (since T2F as a round-down is always < 1)
     *    T2R/T1 <= 1             (since T1F as a round-down is always < 1)
     *    Y2/Z1 <= 1 
     *    Z1 >= Y2 */
    function calcQuoteDelta (uint128 liq, uint128 priceBig, uint128 priceSmall)
        internal pure returns (uint128) {
        uint128 priceDelta = priceBig - priceSmall;

        /* For prices above one unit
         *     T1 = mulDiv(L, d, P')
         *     T2 = mulDiv(T1, Q64, P)
         *
         * By definition P >= Q64, therefore satisfies Z1>Y2 condition for numrical
         * stability. */
        if (priceBig >= FixedPoint.Q64) {
            // By definition the larger price is always bigger than the delta, therefore
            // this term is always guaranteed to be smaller L and fit in 128-bit
            // precision.
            uint256 termOne = uint256(liq) * uint256(priceDelta) / uint256(priceBig);
            uint256 termTwo = FixedPoint.divQ64(uint128(termOne), priceSmall);
            return termTwo.toUint128();
        } else {
            /* Prices below one unit:
             *     T1 = mulDiv(L, Q64, P')
             *     T2 = mulDiv(T1, d, P)
             *
             * By definition Q64>P, therefore Z1>Y2 condition holds for numerical 
             * stability. */
            uint192 termOne = FixedPoint.divQ64(liq, priceBig);

            // All price terms, including delta are at most 64-bits. Therefore this
            // calculation fits safely in 256-bits.
            uint256 termTwo = termOne * uint256(priceDelta) / uint256(priceSmall);
            return termTwo.toUint128();
        }
    }

    /* @notice Returns the amount of virtual reserves give the price and liquidity of the
     *   constant-product liquidity curve.
     *
     * @dev The actual pool probably holds significantly less collateral because of the 
     *   use of concentrated liquidity. 
     * @dev Results always round down from the precise real-valued requirement if 
     *   fractional tokens were possible.   
     * 
     * @param liq - The total active liquidity in AMM curve. Represented as sqrt(X*Y)
     * @param price - The current active (square root of) price of the AMM curve. 
     *                 represnted as 96-bit fixed point.
     * @param inBaseQty - The side of the pool to calculate the virtual reserves for.
     *
     * @returns The virtual reserves of the token (rounded down to nearest integer). 
     *   Equivalent to the amount of tokens that would be held for an equivalent 
     *   classical constant- product AMM without concentrated liquidity.  */
    function reserveAtPrice (uint128 liq, uint128 price, bool inBaseQty)
        internal pure returns (uint128) {
        return uint256(inBaseQty ?
                       FixedPoint.mulQ64(liq, price) :
                       FixedPoint.divQ64(liq, price)).toUint128();
    }

    /* @dev The fixed point arithmetic results in output that's a close approximation
     *   to the true real value, but could be skewed in either direction. The output
     *   from this function should not be consumed in any context that requires strict
     *   boundness. */
    function invertFlow (uint128 liq, uint128 price, uint128 denomFlow,
                         bool isBuy, bool inBaseQty) private pure returns (uint128) {
        uint128 invertReserve = reserveAtPrice(liq, price, !inBaseQty);
        uint128 initReserve = reserveAtPrice(liq, price, inBaseQty);
        
        uint128 endReserve = (isBuy == inBaseQty) ?
            initReserve + denomFlow :
            initReserve - denomFlow;
        if (endReserve == 0) { return type(uint128).max; }
        
        uint128 endInvert = uint128(liq) * uint128(liq) / endReserve;
        return endInvert > invertReserve ?
            endInvert - invertReserve : invertReserve - endInvert;
    }

    /* @notice Computes the amount of token over-collateralization needed to buffer any 
     *   loss of precision rounding in the fixed price arithmetic on curve price. This
     *   is necessary because price occurs in different units than tokens, and we can't
     *   assume a single wei is sufficient to buffer one price unit.
     * 
     * @dev In practice the price unit precision is almost always smaller than the token
     *   token precision. Therefore the result is usually just 1 wei. The exception are
     *   pools where liquidity is very high or price is very low. 
     *
     * @param liq The total liquidity in the curve.
     * @param price The (square root) price of the curve in 96-bit fixed point.
     * @param isRoundUp If true, we're buffering collateral for fixed point rounds to
     *   the upside (i.e. collateral burn in the base token).
     *
     * @return The conservative upper bound in number of tokens that should be 
     *   burned to over-collateralize a single precision unit of price rounding. If
     *   the price arithmetic involves multiple units of precision loss, this number
     *   should be multiplied by that factor. */
    function priceToTokenPrecision (uint128 liq, uint128 price,
                                    bool isRoundUp) internal pure returns (uint128) {
        uint128 liqCons = liq + 1; // Round up to be conservative
        uint128 shift = deriveTokenPrecision(liqCons, price, isRoundUp);
        return shift + 1; // Round up by 1 wei to be conservative
    }

    /* @notice Derives the amount of tokens it would take buffer the curve by one price
     *   precision unit. */
    function deriveTokenPrecision (uint128 liq, uint128 price,
                                   bool inBaseToken) private pure returns (uint128) {
        // To provide more base token collateral than price precision rounding:
        //     delta(B) >= L * delta(P)
        //     delta(P) <= 2^-64  (64 bit precision rounding)
        //     delta(B) >= L * 2^-64
        //  (where L is liquidity, B is base token reserves, P is price)
        if (inBaseToken) {
            return liq >> 64;
        } else {
            // Proivde quote token collateral to buffer price precision roudning:
            //    delta(Q) >= L * delta(1/P)
            //    delta(P) <= 2^-64  (64 bit precision rounding)
            //          P  >= 2^-64  (minimum precision)
            //    delta(Q) >= L * (1/(P-2^-64) - 1/P)
            //             >= L * 2^-64/(P^2 - P * 2^-64)
            //             >= L * 2^-64/(P - 2^-64)^2        (upper bound to above)
            if (price <= FixedPoint.Q64) {
                // The fixed point representation of Price in bits is
                //    Pb = P * 2^64
                // Therefore
                //    delta(Q) >= L * 2^-64/(P/2^64)^2
                //             >= L * 2^64/Pb^2
                //
                uint256 calc = FixedPoint.divSqQ64(liq, price-1);
                if (calc > type(uint128).max) { return type(uint128).max; }
                return uint128(calc);
            } else {
                // If price is greater than 1, Can reduce to this (potentially loose,
                // but still economically small) upper bound:
                //           P >= 1
                //    delta(Q) >= L * 2^-96/P^2
                //             >= L * 2^-96
                return liq >> 64;
            }
        }
    }
}
