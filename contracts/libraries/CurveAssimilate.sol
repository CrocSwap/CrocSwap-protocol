// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;
pragma experimental ABIEncoderV2;

import './SafeCast.sol';
import './FixedPoint.sol';
import './LiquidityMath.sol';
import './CompoundMath.sol';
import './CurveMath.sol';

/* @title Curve fee assimilation library
 * @notice Provides functionality for incorporating arbitrary token fees into
 *         a locally stable constant-product liquidity curve. */
library CurveAssimilate {    
    using LiquidityMath for uint128;
    using CompoundMath for uint128;
    using CompoundMath for uint64;
    using SafeCast for uint256;
    using FixedPoint for uint128;
    using CurveMath for CurveMath.CurveState;

    /* @notice Converts token-based fees into ambient liquidity on the curve,
     *         adjusting the price accordingly.
     * 
     * @dev The user is responsible to make sure that the price shift will never
     *      exceed the locally stable range of the liquidity curve. I.e. that
     *      the price won't cross a book level bump. Because fees are only a tiny
     *      fraction of swap notional, the best approach is to only collect fees
     *      on the segment of the notional up to the level bump price limit. If
     *      a swap spans multiple bumps, then call this function separtely on a
     *      per-segment basis.
     *
     * @param curve  The pre-assimilated state of the consant-product AMM liquidity
     *    curve. This in memory structure will be updated to reflect the impact of 
     *    the assimilation.
     * @param feesPaid  The pre-calculated fees to be collected and incorporated
     *    as liquidity into the curve. Must be denominated (and colleted) on the
     *    opposite pair side as the swap denomination.
     * @param isSwapInBase  Set to true, if the swap is denominated in the base
     *    token of the pair. (And therefore fees are denominated in quote token) */
    function assimilateLiq (CurveMath.CurveState memory curve, uint128 feesPaid,
                            bool isSwapInBase) internal pure {
        // In zero liquidity curves, it makes no sense to assimilate, since
        // it will run prices to infinity.
        uint128 liq = CurveMath.activeLiquidity(curve);
        if (liq == 0) { return; }

        bool feesInBase = !isSwapInBase;
        uint128 feesToLiq = shaveForPrecision(liq, curve.priceRoot_,
                                              feesPaid, feesInBase);
        uint64 inflator = calcLiqInflator(liq, curve.priceRoot_,
                                          feesToLiq, feesInBase);

        if (inflator > 0) {
            stepToLiquidity(curve, inflator, feesInBase);
        }
    }

    /* @notice Converts a fixed fee collection into a constant product liquidity
     *         multiplier.
     * @dev    To be conservative, every fixed point calculation step rounds down.
     *         Because of this the result can be an arbitrary epsilon smaller than
     *         the real formula.
     * @return The imputed percent growth to aggregate liquidity resulting from 
     *         assimilating these fees into the virtual reserves. Represented as
     *         Q16.48 fixed-point, where the result G is used as a (1+G) multiplier. */
    function calcLiqInflator (uint128 liq, uint128 price, uint128 feesPaid,
                              bool inBaseQty) private pure returns (uint64) {
        // First calculate the virtual reserves at the curve's current price...
        uint128 reserve = CurveMath.reserveAtPrice(liq, price, inBaseQty);
 
        // ...Then use that to calculate how much the liqudity would grow assuming the
        // fees were added as reserves into an equivalent constant-product AMM curve.
        return calcReserveInflator(reserve, feesPaid);
    }

    /* @notice Converts a fixed delta change in the virtual reserves to a percent 
     *         change in the AMM curve's active liquidity. */
    function calcReserveInflator (uint128 reserve, uint128 feesPaid)
        private pure returns (uint64) {
        // Short-circuit when virtual reserves are smaller than fees. This can only
        // occur when liquidity is extremely small, and so is economically
        // meanignless. But guarantees numerical stability.
        if (reserve == 0 || feesPaid > reserve) { return 0; }
        
        uint128 nextReserve = reserve + feesPaid;
        uint64 inflator = nextReserve.compoundDivide(reserve);
        
        // Since Liquidity is represented as Sqrt(X*Y) the growth rate of liquidity is
        // Sqrt(X'/X) where X' = X + delta(X)
        return inflator.approxSqrtCompound();
    }

    /* @notice Adjusts the fees assimilated into the liquidity curve. This is done to
     *    hold out a small amount of collateral that doesn't expand the liquidity
     *    in the curve. That's necessary so we have slack in the virtual reserves to
     *    prevent under-collateralization resulting from fixed point precision rounding
     *    on the price shift. 
     *    
     * @dev Price can round up to one precision unit (2^-64) away from the true real
     *    value. Therefore we have to over-collateralize the existing liquidity by
     *    enough to buffer the virtual reserves by this amount. Economically this is 
     *    almost always a meaningless amount. Often just 1 wei (rounded up) for all but
     *    the biggest or most extreme priced curves. 
     *
     * @return The amount of reward fees available to assimilate into the liquidity
     *    curve after deducting the precision over-collaterilization allocation. */
    function shaveForPrecision (uint128 liq, uint128 price, uint128 feesPaid,
                                bool isFeesInBase)
        private pure returns (uint128) {
        uint128 bufferTokens = CurveMath.priceToTokenPrecision
            (liq, price, isFeesInBase);
        unchecked {
        return feesPaid <= bufferTokens ?
            0 : feesPaid - bufferTokens; // Condition assures never underflow
        }
    }

    /* @notice Given a targeted aggregate liquidity inflator, affects that change in
     *    the curve object by expanding the ambient seeds, and adjusting the cumulative
     *    growth accumulators as needed. 
     *
     * @dev To be conservative, a number of fixed point calculations will round down 
     *    relative to the exact mathematical liquidity value. This is to prevent 
     *    under-collateralization from over-expanding liquidity relative to virtual 
     *    reserves available to the pool. This means the curve's liquidity grows slightly
     *    less than mathematical exact calculation would imply. 
     *
     * @dev    Price is always rounded further in the direction of the shift. This 
     *         shifts the collateralization burden in the direction of the fee-token.
     *         This makes sure that the opposite token's collateral requirements is
     *         unchanged. The fee token should be sufficiently over-collateralized from
     *         a previous adjustment made in shaveForPrecision()
     *
     * @param curve The current state of the liquidity curve, will be updated to reflect
     *              the assimilated liquidity from fee accumulation.
     * @param inflator The incremental growth in total curve liquidity contributed by this
     *                 swaps paid fees.
     * @param feesInBase If true, indicates swap paid fees in base token. */
    function stepToLiquidity (CurveMath.CurveState memory curve,
                              uint64 inflator, bool feesInBase) private pure {
        curve.priceRoot_ = CompoundMath.compoundPrice
            (curve.priceRoot_, inflator, feesInBase);

        // The formula for Liquidity is
        //     L = A + C 
        //       = S * (1 + G) + C
        //   (where A is ambient liqudity, S is ambient seeds, G is ambient growth,
        //    and C is conc. liquidity)
        //
        // Liquidity growth is distributed pro-rata, between the ambient and concentrated
        // terms. Therefore ambient-side growth is reflected by inflating the growth rate:
        //    A' = A * (1 + I)
        //       = S * (1 + G) * (1 + I)
        //   (where A' is the post transaction ambient liquidity, and I is the liquidity
        //    inflator for this transaction)
        //
        // Note that if the deflator reaches its maximum value (equivalent to 2^16), then
        // this value will cease accumulating new rewards. Essentially all fees attributable
        // to ambient liquidity will be burned. Economically speaking, this is unlikely to happen
        // for any meaningful pool, but be aware. See the Ambient Rewards section of the
        // documentation at docs/CurveBound.md in the repo for more discussion.
        curve.seedDeflator_ = curve.seedDeflator_
            .compoundStack(inflator);

        // Now compute the increase in ambient seed rewards to concentrated liquidity.
        // Rewards stored as ambient seeds, but collected in the form of liquidity:
        //    Ar = Sr * (1 + G)
        //    Sr = Ar / (1 + G)
        //  (where Ar are concentrated rewards in ambient liquidity, and Sr are
        //   concentrated rewards denominated in ambient seeds)
        //
        // Note that there's a minor difference from using the post-inflated cumulative
        // ambient growth (G) calculated in the previous step. This rounds the rewards
        // growth down, which increases numerical over-collateralization.

        // Concentrated rewards are represented as a rate of per unit ambient growth
        // in seeds. Therefore to calculate the marginal increase in concentrated liquidity
        // rewards we deflate the marginal increase in total liquidity by the seed-to-liquidity
        // deflator
        uint64 concRewards = inflator.compoundShrink(curve.seedDeflator_);

        // Represents the total number of new ambient liquidity seeds that are created from
        // the swap fees accumulated as concentrated liquidity rewards. (All concentrated rewards
        // are converted to ambient seeds.) To calculate we take the marginal increase in concentrated
        // rewards on this swap and multiply by the total amount of active concentrated liquidity.
        uint128 newAmbientSeeds = uint256(curve.concLiq_.mulQ48(concRewards))
            .toUint128();

        // To be conservative in favor of over-collateralization, we want to round down the marginal
        // rewards.
        curve.concGrowth_ += roundDownConcRewards(concRewards, newAmbientSeeds);
        curve.ambientSeeds_ += newAmbientSeeds;
    }

    /* @notice To avoid over-promising rewards, we need to make sure that fixed-point
     *   rounding effects don't round concentrated rewards growth more than ambient 
     *   seeds. Otherwise we could possibly reach a situation where burned rewards 
     *   exceed the the ambient seeds stored on the curve.
     *
     * @dev Functionally, the reward inflator is most likely higher precision than
     *   the ambient seed injection. Therefore prevous fixed point math that rounds
     *   down both could over-promise rewards realtive to backed seeds. To correct
     *   for this, we have to shrink the rewards inflator by the precision unit's 
     *   fraction of the ambient injection. Thus guaranteeing that the adjusted rewards
     *   inflator under-promises relative to backed seeds. */
    function roundDownConcRewards (uint64 concInflator, uint128 newAmbientSeeds)
        private pure returns (uint64) {
        // No need to round down if the swap was too small for concentrated liquidity
        // to earn any rewards.
        if (newAmbientSeeds == 0) { return 0; }

        // We always want to make sure that the rewards accumulator is conservatively
        // rounded down relative to the actual liquidity being added to the curve.
        //
        // To shrink the rewards by ambient round down precision we use the formula:
        // R' = R * A / (A + 1)
        //   (where R is the rewards inflator, and A is the ambient seed injection)
        //
        // Precision wise this all fits in 256-bit arithmetic, and is guaranteed to
        // cast to 64-bit result, since the result is always smaller than the original
        // inflator.
        return uint64(uint256(concInflator) * uint256(newAmbientSeeds) /
                      uint256(newAmbientSeeds + 1));
    }
}
