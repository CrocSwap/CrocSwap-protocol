// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;
pragma experimental ABIEncoderV2;

import './SafeCast.sol';
import './FixedPoint.sol';
import './LiquidityMath.sol';
import './CompoundMath.sol';

/* @title Curve and swap math library
 * @notice Library that defines locally stable constant liquidity curves and
 *         swap struct, as well as functions to derive impact and aggregate 
 *         liquidity measures on these objects. */
library CurveMath {
    using LiquidityMath for uint128;
    using CompoundMath for uint256;
    using SafeCast for uint256;
    using SafeCast for uint192;

    /* All CrocSwap swaps occur as legs across locally stable constant-product AMM
     * curves. For large moves across tick boundaries, the state of this curve might 
     * change as range-bound liquidity is kicked in or out of the currently active 
     * curve. But for small moves within tick boundaries (or between tick boundaries 
     * with no liquidity bumps), the curve behaves like a classic constant-product AMM.
     *
     * CrocSwap tracks two types of liquidity. 1) Ambient liquidity that is non-
     * range bound and remains active at all prices from zero to infinity, until 
     * removed by the staking user. 2) Concentrated liquidity that is tied to an 
     * arbitrary lower<->upper tick range and is kicked out of the curve when the
     * price moves out of range.
     *
     * In the CrocSwap model all collected fees are directly incorporated as expanded
     * liquidity onto the curve itself. (See CurveAssimilate.sol for more on the 
     * mechanics.) All accumulated fees are added as ambient-type liquidity, even those
     * fees that belong to the pro-rata share of the active concentrated liquidity.
     * This is because on an aggregate level, we can't break down the pro-rata share
     * of concentrated rewards to the potentially near infinite concentrated range
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
     * rewards compounded on top of concentrated rewards. 
     *
     * @param priceRoot_ The square root of the price ratio exchange rate between the
     *   base and quote-side tokens in the AMM curve. (represented in Q64.64 fixed point)
     * @param ambientSeeds_ The total ambient liquidity seeds in the current curve. 
     *   (Inflated by seed deflator to get efective ambient liquidity)
     * @param concLiq_ The total concentrated liquidity active and in range at the
     *   current state of the curve.
     * @param seedDeflator_ The cumulative growth rate (represented as Q16.48 fixed
     *    point) of a hypothetical 1-unit of ambient liquidity held in the pool since
     *    inception.
     * @param concGrowth_ The cumulative rewards growth rate (represented as Q16.48
     *   fixed point) of hypothetical 1 unit of concentrated liquidity in range in the
     *   pool since inception. 
     *
     * @dev Price ratio is stored as a square root because it makes reserve calculation
     *      arithmetic much easier. To be conservative with collateral these growth 
     *      rates should always be rounded down from their real-value results. Some 
     *      minor lower-bound approximation is fine, since all it will result in is 
     *      slightly smaller reward payouts. */
    struct CurveState {
        uint128 priceRoot_;
        uint128 ambientSeeds_;
        uint128 concLiq_;
        uint64 seedDeflator_;
        uint64 concGrowth_;
    }

    
    /* @notice Calculates the total amount of liquidity represented by the liquidity 
     *         curve object.
     * @dev    Result always rounds down from the real value, *assuming* that the fee
     *         accumulation fields are conservative lower-bound rounded.
     * @param curve - The currently active liqudity curve state. Remember this curve 
     *    state is only known to be valid within the current tick.
     * @return - The total scalar liquidity. Equivalent to sqrt(X*Y) in an equivalent 
     *           constant-product AMM. */
    function activeLiquidity (CurveState memory curve) internal pure returns (uint128) {
        uint128 ambient = CompoundMath.inflateLiqSeed
            (curve.ambientSeeds_, curve.seedDeflator_);
        return LiquidityMath.addLiq(ambient, curve.concLiq_);
    }

    /* @notice Similar to calcLimitFlows(), except returns the max possible flow in the
     *   *opposite* direction. I.e. if inBaseQty_ is True, returns the quote token flow
     *   for the swap. And vice versa..
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
     * @param swapQty - The total remaining quantity left in the swap.
     * @param inBaseQty - Whether the swap quantity is denomianted in base or quote side
     *                    token.
     * @param limitPrice - The highest (lowest) acceptable ending price of the AMM curve
     *   for a buy (sell) swap. Represented as Q64.64 fixed point square root of the 
     *   price. 
     *
     * @return - The maximum executable swap flow (rounded down by fixed precision).
     *           Denominated on the token side based on inBaseQty param. Will
     *           always return unsigned magnitude regardless of the direction. User
     *           can easily determine based on swap context. */
    function calcLimitFlows (CurveState memory curve, uint128 swapQty,
                             bool inBaseQty, uint128 limitPrice)
        internal pure returns (uint128) {
        // Calculates the total swap flow it takes to reach the limit price
        uint256 limitFlow = calcLimitFlows(curve, inBaseQty, limitPrice);

        // If the swap qty exceeds the limit flow, it implies we'll reach the limit
        // price on this swap step, and should only collect fees on the flow for this
        // step. 
        if (limitFlow < type(uint128).max) {
            return limitFlow > swapQty ? swapQty : limitFlow.toUint128();
        } else {
            // If estimated limitFlow exceeds uint128.max that bounds token flows, (which can
            // happen when we're trying to swap with no effective limit price), then swapQty
            // by definition is less than the limitFlow value, since it's a uint128 val
            return swapQty;
        }
    }
    
    function calcLimitFlows (CurveState memory curve, bool inBaseQty,
                             uint128 limitPrice) private pure returns (uint256) {
        uint128 liq = activeLiquidity(curve);
        return inBaseQty ?
            deltaBase256(liq, curve.priceRoot_, limitPrice) :
            deltaQuote256(liq, curve.priceRoot_, limitPrice);
    }

    /* @notice Calculates the change to base token reserves associated with a price
     *   move along an AMM curve of constant liquidity.
     *
     * @dev Result is a tight lower-bound for fixed-point precision. Meaning if the
     *   the returned limit is X, then X will be inside the limit price and (X+1)
     *   will be outside the limit price. */
    function deltaBase (uint128 liq, uint128 priceX, uint128 priceY)
        internal pure returns (uint128) {
        unchecked {
        uint128 priceDelta = priceX > priceY ?
            priceX - priceY : priceY - priceX; // Condition assures never underflows
        return reserveAtPrice(liq, priceDelta, true);
        }
    }

    /* @notice Same as deltaBase() but does not cast to uint128. */
    function deltaBase256 (uint128 liq, uint128 priceX, uint128 priceY)
        internal pure returns (uint256) {
        unchecked {
        uint128 priceDelta = priceX > priceY ?
            priceX - priceY : priceY - priceX; // Condition assures never underflows
        return reserveAtPrice256(liq, priceDelta, true);
        }
    }

    /* @notice Calculates the change to quote token reserves associated with a price
     *   move along an AMM curve of constant liquidity.
     * 
     * @dev Result is almost always within a fixed-point precision unit from the true
     *   real value. However in certain rare cases, the result could be up to 2 wei
     *   below the true mathematical value. Caller should account for this */
    function deltaQuote (uint128 liq, uint128 price, uint128 limitPrice)
        internal pure returns (uint128) {
        return deltaQuote256(liq, price, limitPrice).toUint128();
    }

    /* @notice Same as deltaQuote() but does not cast to uint128. */
    function deltaQuote256 (uint128 liq, uint128 price, uint128 limitPrice)
        internal pure returns (uint256) {
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
     * Calculating this requires two stacked mulDiv. To meet the function's contract
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
     *    Y2/Z2 >= 1
     *    Z2 >= Y2 */
    function calcQuoteDelta (uint128 liq, uint128 priceBig, uint128 priceSmall)
        private pure returns (uint256) {
        uint128 priceDelta = priceBig - priceSmall;

        // This is cast to uint256 but is guaranteed to be less than 2^192 based off
        // the return type of divQ64
        uint256 termOne = FixedPoint.divQ64(liq, priceSmall);
        
        // As long as the final result doesn't overflow from 128-bits, this term is
        // guaranteed not to overflow from 256 bits. That's because the final divisor
        // can be at most 128-bits, therefore this intermediate term must be 256 bits
        // or less.
        //
        // By definition priceBig is always larger than priceDelta. Therefore the above
        // condition of Z2 >= Y2 is satisfied and the equation caps at a maximum of 2
        // wei of precision loss.
        uint256 termTwo = termOne * uint256(priceDelta) / uint256(priceBig);
        return termTwo;
    }

    /* @notice Returns the amount of virtual reserves give the price and liquidity of the
     *   constant-product liquidity curve.
     *
     * @dev The actual pool probably holds significantly less collateral because of the 
     *   use of concentrated liquidity. 
     * @dev Results always round down from the precise real-valued mathematical result.
     * 
     * @param liq - The total active liquidity in AMM curve. Represented as sqrt(X*Y)
     * @param price - The current active (square root of) price of the AMM curve. 
     *                 represnted as Q64.64 fixed point
     * @param inBaseQty - The side of the pool to calculate the virtual reserves for.
     *
     * @returns The virtual reserves of the token (rounded down to nearest integer). 
     *   Equivalent to the amount of tokens that would be held for an equivalent 
     *   classical constant- product AMM without concentrated liquidity.  */
    function reserveAtPrice (uint128 liq, uint128 price, bool inBaseQty)
        internal pure returns (uint128) {
        return reserveAtPrice256(liq, price, inBaseQty).toUint128();
    }

    /* @notice Same as reserveAtPrice() but does not cast to uint128. */
    function reserveAtPrice256 (uint128 liq, uint128 price, bool inBaseQty)
        internal pure returns (uint256) {
        return (inBaseQty ?
                    uint256(FixedPoint.mulQ64(liq, price)) :
                    uint256(FixedPoint.divQ64(liq, price)));
    }

    /* @notice Calculated the amount of concentrated liquidity within a price range
     *         supported by a fixed amount of collateral. Note that this calculates the 
     *         collateral only needed by one side of the pair.
     *
     * @dev    Always rounds fixed-point arithmetic result down. 
     *
     * @param collateral The total amount of token collateral being pledged.
     * @param inBase If true, the collateral represents the base-side token in the pair.
     *               If false the quote side token.
     * @param priceX The price boundary of the concentrated liquidity position.
     * @param priceY The other price boundary of the concentrated liquidity position.
     * @returns The total amount of liquidity supported by the collateral. */
    function liquiditySupported (uint128 collateral, bool inBase,
                                 uint128 priceX, uint128 priceY)
        internal pure returns (uint128) {
        if (!inBase) {
            return liquiditySupported(collateral, true,
                                      FixedPoint.recipQ64(priceX),
                                      FixedPoint.recipQ64(priceY));
        } else {
            unchecked {
            uint128 priceDelta = priceX > priceY ?
                priceX - priceY : priceY - priceX; // Conditional assures never underflows
            return liquiditySupported(collateral, true, priceDelta);
            }
        }
    }

    /* @notice Calculated the amount of ambient liquidity supported by a fixed amount of 
     *         collateral. Note that this calculates the collateral only needed by one
     *         side of the pair.
     *
     * @dev    Always rounds fixed-point arithmetic result down. 
     *
     * @param collateral The total amount of token collateral being pledged.
     * @param inBase If true, the collateral represents the base-side token in the pair.
     *               If false the quote side token.
     * @param price The current (square root) price of the curve as Q64.64 fixed point.
     * @returns The total amount of ambient liquidity supported by the collateral. */
    function liquiditySupported (uint128 collateral, bool inBase, uint128 price)
        internal pure returns (uint128) {
        return inBase ?
            FixedPoint.divQ64(collateral, price).toUint128By192() :
            FixedPoint.mulQ64(collateral, price).toUint128By192();
    }

    /* @dev The fixed point arithmetic results in output that's a close approximation
     *   to the true real value, but could be skewed in either direction. The output
     *   from this function should not be consumed in any context that requires strict
     *   boundness. */
    function invertFlow (uint128 liq, uint128 price, uint128 denomFlow,
                         bool isBuy, bool inBaseQty) private pure returns (uint128) {
        if (liq == 0) { return 0; }

        uint256 invertReserve = reserveAtPrice(liq, price, !inBaseQty);
        uint256 initReserve = reserveAtPrice(liq, price, inBaseQty);

        unchecked {
        uint256 endReserve = (isBuy == inBaseQty) ?
            initReserve + denomFlow : // Will always fit in 256-bits
            initReserve - denomFlow; // flow is always less than total reserves
        if (endReserve == 0) { return type(uint128).max; }
        
        uint256 endInvert = uint256(liq) * uint256(liq) / endReserve;
        return (endInvert > invertReserve ?
                endInvert - invertReserve :
                invertReserve - endInvert).toUint128();
        }
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
     * @param price The (square root) price of the curve in Q64.64 fixed point
     * @param inBase If true calculate the token precision on the base side of the pair.
     *               Otherwise, calculate on the quote token side. 
     *
     * @return The conservative upper bound in number of tokens that should be 
     *   burned to over-collateralize a single precision unit of price rounding. If
     *   the price arithmetic involves multiple units of precision loss, this number
     *   should be multiplied by that factor. */
    function priceToTokenPrecision (uint128 liq, uint128 price,
                                    bool inBase) internal pure returns (uint128) {
        unchecked {
        // To provide more base token collateral than price precision rounding:
        //     delta(B) >= L * delta(P)
        //     delta(P) <= 2^-64  (64 bit precision rounding)
        //     delta(B) >= L * 2^-64
        //  (where L is liquidity, B is base token reserves, P is price)
        if (inBase) {
            // Since liq is shifted right by 64 bits, adding one can never overflow
            return (liq >> 64) + 1; 
            
        } else {
            // Calculate the quote reservs at the current price and a one unit price step,
            // then take the difference as the minimum required quote tokens needed to
            // buffer that price step.
            uint192 step = FixedPoint.divQ64(liq, price - 1);
            uint192 start = FixedPoint.divQ64(liq, price);

            // next reserves will always be equal or greater than start reserves, so the 
            // subtraction will never underflow. 
            uint192 delta = step - start;

            // Round tokens up conservative.
            // This will never overflow because 192 bit nums incremented by 1 will always fit in
            // 256 bits.
            uint256 deltaRound = uint256(delta) + 1;

            return deltaRound.toUint128();
        }
        }
    }

}
