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

/* @title Curve fee assimilation library
 * @notice Provides functionality for incorporating arbitrary token fees into
 *         a locally stable constant-product liquidity curve. */
library CurveAssimilate {    
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using LiquidityMath for uint128;
    using CompoundMath for uint256;
    using CurveMath for CurveMath.CurveLiquidity;
    using CurveMath for CurveMath.SwapAccum;

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

     * @params curve  The pre-assimilated state of the consant-product AMM liquidity
     *    curve. This in memory structure will be updated to reflect the impact of 
     *    the assimilation.
     * @params feesPaid  The pre-calculated fees to be collected and incorporated
     *    as liquidity into the curve. Must be denominated (and colleted) on the
     *    opposite pair side as the swap denomination.
     * @params isSwapInBase  Set to true, if the swap is denominated in the base
     *    token of the pair. (And therefore fees are denominated in quote token) */
    function assimilateLiq (CurveMath.CurveState memory curve, uint256 feesPaid,
                            bool isSwapInBase) internal pure {
        // In zero liquidity curves, it makes no sense to assimilate, since
        // it will run prices to infinity. 
        if (CurveMath.activeLiquidity(curve) == 0) { return; }
        
        bool feesInBase = !isSwapInBase;
        uint256 inflator = calcLiqInflator(curve, feesPaid, feesInBase);
        stepToPrice(curve, inflator, feesInBase);
        stepToLiquidity(curve, inflator);
    }

    function calcLiqInflator (CurveMath.CurveState memory curve, uint256 feesPaid,
                              bool inBaseQty) private pure returns (uint256) {
        uint128 liq = CurveMath.activeLiquidity(curve);
        uint256 reserve = CurveMath.reserveAtPrice(liq, curve.priceRoot_, inBaseQty);
        return calcReserveInflator(reserve, feesPaid);
    }

    function calcReserveInflator (uint256 reserve, uint256 feesPaid)
        private pure returns (uint256) {
        uint256 nextReserve = reserve.add(feesPaid);
        uint256 inflator = nextReserve.compoundDivide(reserve);
        return inflator.approxSqrtCompound();
    }

    function stepToPrice (CurveMath.CurveState memory curve, uint256 inflator,
                          bool inBaseQty) private pure {
        uint256 nextPrice = inBaseQty ?
            CompoundMath.compoundGrow(curve.priceRoot_, inflator) :
            CompoundMath.compoundShrink(curve.priceRoot_, inflator);
        curve.priceRoot_ = uint160(nextPrice);
    }

    
    function stepToLiquidity (CurveMath.CurveState memory curve,
                              uint256 inflator) private pure {
        curve.accum_.ambientGrowth_ = curve.accum_.ambientGrowth_
            .compoundAdd(inflator);

        uint256 tokenGrowth = inflator.compoundShrink(curve.accum_.ambientGrowth_);
        curve.accum_.concTokenGrowth_ = curve.accum_.concTokenGrowth_
            .add(tokenGrowth);

        uint256 ambientInject = FullMath.mulDiv
            (tokenGrowth, curve.liq_.concentrated_, FixedPoint128.Q128);
        curve.liq_.ambientSeed_ = curve.liq_.ambientSeed_
            .addDelta(uint128(ambientInject));
    }
}
