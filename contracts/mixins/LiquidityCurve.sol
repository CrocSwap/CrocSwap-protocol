// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import '../libraries/FullMath.sol';
import '../libraries/TickMath.sol';
import '../libraries/FixedPoint96.sol';
import '../libraries/LiquidityMath.sol';
import '../libraries/SafeCast.sol';
import '../libraries/LowGasSafeMath.sol';
import '../libraries/PoolSpecs.sol';
import '../libraries/CurveMath.sol';

/* @title Liquidity Curve Mixin
 * @notice Tracks the state of the locally stable constant product AMM liquid curve
 *         for the pool. Applies any adjustment to the curve as needed, either from
 *         new or removed positions or pre-determined liquidity bumps that occur
 *         when crossing tick boundaries. */
contract LiquidityCurve {
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using SafeCast for uint256;
    using SafeCast for uint128;
    using SafeCast for int256;
    using CurveMath for CurveMath.CurveState;
    using CurveMath for uint128;

    mapping(uint8 => CurveMath.CurveState) private curves_;

    /* @notice Returns the total liquidity currently active in the curve. */
    function activeLiquidity() view internal returns (uint128) {
        return curves_[0].activeLiquidity();
    }

    /* @notice Returns the cumulative concentrated liquidity reward growth since the
     *         the beggining of the pool. Represents the cumulative growth to a 
     *         hypothetical single unit of liquidity that was staked and in-range since
     *         the inception of the pool. Used downstream to benchmark liquidity rewards
     *         for individual positions with varying time spent in-range.
     * @return Represented as 128-bit fixed point real corresponding to the cumulative
     *         realized growth. Concentrated liquidity rewards are accumulated in the
     *         form of ambient liquidity seeds (see library/CurveMath.sol) */
    function tokenOdometer() view internal returns (uint256) {
        return curves_[0].accum_.concTokenGrowth_;
    }

    /* @notice Copies the current state of the curve in EVM storage to a memory clone.
     * @dev    Use for light-weight gas ergonomics when iterarively operating on the 
     *         curve. But it's the callers responsibility to persist the changes back
     *         to storage when complete. */
    function snapCurve() view internal returns (CurveMath.CurveState memory curve) {
        curve = curves_[0];
        require(curve.priceRoot_ > 0, "J");
    }

    /* @notice Gas efficiently writes a CurveState modified in memory back into 
     *         persistent memory. Use for the working copy from snapCurve when 
     *         finalized. */
    function commitSwapCurve (CurveMath.CurveState memory curve) internal {
        curves_[0].priceRoot_ = curve.priceRoot_;
        curves_[0].accum_ = curve.accum_;
        if (curves_[0].liq_.ambientSeed_ != curve.liq_.ambientSeed_ ||
            curves_[0].liq_.concentrated_ != curve.liq_.concentrated_) {
            curves_[0].liq_ = curve.liq_;
        }
    }
    
    /* @notice Called whenever a user adds a fixed amount of concentrated liquidity
     *         to the curve. This must be called regardless of whether the liquidity is
     *         in-range at the current curve price or not.
     * @dev After being called this will alter the curve to reflect the new liquidity, 
     *      but it's the callers responsibility to make sure that the required 
     *      collateral is actually collected.
     *
     * @param liquidity The amount of liquidity being added. Represented in the form of
     *                  sqrt(X*Y) where X,Y are the virtual reserves of the tokens in a
     *                  constant product AMM. Calculate the same whether in-range or not.
     * @param lowerTick The tick index corresponding to the bottom of the concentrated 
     *                  liquidity range.
     * @param upperTick The tick index corresponding to the bottom of the concentrated 
     *                  liquidity range.
     *
     * @return base - The amount of base token collateral that must be collected 
     *                following the addition of this liquidity.
     * @return quote - The amount of quote token collateral that must be collected 
     *                 following the addition of this liquidity. */
    function liquidityReceivable (uint128 liquidity,
                                  int24 lowerTick, int24 upperTick)
        internal returns (uint256, uint256) {
        (uint256 base, uint256 quote, bool inRange) =
            liquidityFlows(liquidity, lowerTick, upperTick);
        bumpConcentrated(liquidity, inRange);
        return chargeConservative(base, quote);
    }

    /* @notice Equivalent to above, but used when adding non-range bound constant 
     *         product ambient liquidity.
     * @dev Like above, it's the caller's responsibility to collect the necessary 
     *      collateral to add to the pool.

     * @param seeds The number of ambient seeds being added. Note that this is 
     *              denominated as seeds *not* liquidity. The amount of liquidity
     *              contributed will be based on the current seed->liquidity conversion
     *              rate on the curve. (See CurveMath.sol.) */
    function liquidityReceivable (uint128 seeds) 
        internal returns (uint256, uint256) {
        (uint256 base, uint256 quote) = liquidityFlows(seeds);
        bumpAmbient(seeds);
        return chargeConservative(base, quote);
    }

    /* @notice Called when liquidity is being removed from the pool Adjusts the curve
     *         accordingly and calculates the amount of collateral payable to the user.
     *         This must be called for all removes regardless of whether the liquidity
     *         is in range or not.
     * @dev It's the caller's responsibility to actually return the collateral to the 
     *      user. This method will only calculate what's owed, but won't actually pay it.
     *
     * @param liquidity The amount of liquidity being removed, whether in-range or not.
     *                  Represented in the form of sqrt(X*Y) where x,Y are the virtual
     *                  reserves of a constant product AMM.
     * @param rewardRate The total cumulative earned but unclaimed rewards on the staked
     *                   liquidity. Used to increment the payout with the rewards, and
     *                   burn the ambient liquidity tied to the rewards. (See 
     *                   CurveMath.sol for more.) Represented as a 128-bit fixed point
     *                   cumulative growth rate of ambient seeds per unit of liquidity.
     * @param lowerTick The tick index corresponding to the bottom of the concentrated 
     *                  liquidity range.
     * @param upperTick The tick index corresponding to the bottom of the concentrated 
     *                  liquidity range.
     *
     * @return base - The amount of base token collateral that can be paid out following
     *                the removal of the liquidity. Always rounded down to favor 
     *                collateral stability.
     * @return quote - The amount of base token collateral that can be paid out following
     *                the removal of the liquidity. Always rounded down to favor 
     *                collateral stability. */
    function liquidityPayable (uint128 liquidity, uint256 rewardRate,
                               int24 lowerTick, int24 upperTick)
        internal returns (uint256 base, uint256 quote) {
        (base, quote) = liquidityPayable(liquidity, lowerTick, upperTick);

        if (rewardRate > 0) {
            // Round down reward sees on payout, in contrast to rounding them up on
            // incremental accumulation (see CurveAssimilate.sol). This mathematicaly
            // guarantees that we never try to burn more tokens than exist on the curve.
            uint256 rewards = FullMath.mulDiv(liquidity, rewardRate, FixedPoint128.Q128);
            
            if (rewards > 0) {
                (uint256 baseRewards, uint256 quoteRewards) =
                    liquidityPayable(rewards.toUint128());
                base += baseRewards;
                quote += quoteRewards;
            }
        }
    }

    /* @notice The same as the above liquidityPayable() but called when accumulated 
     *         rewards are zero. */
    function liquidityPayable (uint128 liquidity,
                               int24 lowerTick, int24 upperTick)
        internal returns (uint256 base, uint256 quote) {
        bool inRange;
        (base, quote, inRange) = liquidityFlows(liquidity, lowerTick, upperTick);
        bumpConcentrated(-(liquidity.toInt256()), inRange);
    }

    /* @notice Same as above liquidityPayable() but used for non-range based ambient
     *         constant product liquidity.
     *
     * @param seeds The number of ambient seeds being added. Note that this is 
     *              denominated as seeds *not* liquidity. The amount of liquidity
     *              contributed will be based on the current seed->liquidity conversion
     *              rate on the curve. (See CurveMath.sol.) 
     * @return base - The amount of base token collateral that can be paid out following
     *                the removal of the liquidity. Always rounded down to favor 
     *                collateral stability.
     * @return quote - The amount of base token collateral that can be paid out following
     *                the removal of the liquidity. Always rounded down to favor 
     *                collateral stability. */
    function liquidityPayable (uint128 seeds)
        internal returns (uint256 base, uint256 quote) {
        (base, quote) = liquidityFlows(seeds);
        bumpAmbient(-(seeds.toInt256()));
    }

    function bumpAmbient (uint128 seedDelta) private {
        bumpAmbient(int256(uint256(seedDelta)));
    }

    function bumpAmbient (int256 seedDelta) private {
        curves_[0].liq_.ambientSeed_ = LiquidityMath.addDelta
            (curves_[0].liq_.ambientSeed_, seedDelta.toInt128());
    }

    function bumpConcentrated (uint128 liqDelta, bool inRange) private {
        bumpConcentrated(int256(uint256(liqDelta)), inRange);
    }
    
    function bumpConcentrated (int256 liqDelta, bool inRange) private {
        if (inRange) {
            uint128 prevLiq = curves_[0].liq_.concentrated_;
            uint128 nextLiq = LiquidityMath.addDelta
                (prevLiq, liqDelta.toInt128());
            curves_[0].liq_.concentrated_ = nextLiq;
        }
    }
    

    /* @dev Uses fixed-point math that rounds down up to 2 wei from the true real valued
     *   flows. Safe to pay this flow, but when pool is receiving caller must make sure
     *   to round up for collateral safety. */
    function liquidityFlows (uint128 liquidity,
                             int24 bidTick, int24 askTick)
        private view returns (uint256 baseDebit, uint256 quoteDebit, bool inRange) {
        (uint160 price, int24 priceTick) = loadPriceTick();
        (uint160 bidPrice, uint160 askPrice) =
            translateTickRange(bidTick, askTick);

        if (priceTick < bidTick) {
            quoteDebit = liquidity.deltaQuote(bidPrice, askPrice);
        } else if (priceTick >= askTick) {
            baseDebit = liquidity.deltaBase(bidPrice, askPrice);
        } else {
            quoteDebit = liquidity.deltaQuote(price, askPrice);
            baseDebit = liquidity.deltaBase(bidPrice, price);
            inRange = true;
        }
    }
    
    /* @dev Uses fixed-point math that rounds down at each division. Because there are
     *   divisions, max precision loss is under 2 wei. Safe to pay this flow, but when
     *   when pool is receiving, caller must make sure to round up for collateral 
     *   safety. */
    function liquidityFlows (uint128 seeds)
        private view returns (uint256 baseDebit, uint256 quoteDebit) {
        uint160 price  = curves_[0].priceRoot_;
        uint128 liq = CompoundMath.inflateLiqSeed
            (seeds, curves_[0].accum_.ambientGrowth_);
        baseDebit = FullMath.mulDiv(liq, price, FixedPoint96.Q96);
        quoteDebit = (uint256(liq) << FixedPoint96.RESOLUTION) / price;
    }

    /* @notice Writes a new price into the curve (without any adjustment to liquidity)
     * @dev For scenarios where the price is being incrementally updated, it'll be more
     *      gas efficient to use the snapCurve()/commitCurve() workflow. Throws error
     *      if price wasn't previously initialized.
     * @param priceRoot - Square root of the price. Represented as 96-bit fixed point.
     * @return priceTick - 24-bit tick index of the new price. */
    function updatePrice (uint160 priceRoot) internal returns (int24 priceTick) {
        require(curves_[0].priceRoot_ > 0, "J");
        curves_[0].priceRoot_ = priceRoot;
        priceTick = TickMath.getTickAtSqrtRatio(priceRoot);
    }

    /* @notice Called exactly once at the initializing of the pool. Initializes the
     *         liquidity curve at an arbitrary price.
     * @dev Throws error if price was already initialized. 
     * @param priceRoot - Square root of the price. Represented as 96-bit fixed point. */
    function initPrice (uint160 priceRoot) internal {
        require(curves_[0].priceRoot_ == 0, "N");
        curves_[0].priceRoot_ = priceRoot;
    }

    /* @notice Loads price info fromt the current state of the curve.
     * @dev Throws error if price wasn't previously initialized.
     * @return priceRoot - Square root of the price. Represented as 96-bit fixed point.
     * @return priceTick - 24-bit price tick index of the price. */
    function loadPriceTick() internal view
        returns (uint160 priceRoot, int24 priceTick) {
        (priceRoot, priceTick) = loadPriceTickMaybe();
        require(priceRoot > 0, "J");
    }

    /* @notice Same as loadPriceTick() but safe to call for pre-initialized prices. If
     *         so returns zero values. */
    function loadPriceTickMaybe() internal view
        returns (uint160 priceRoot, int24 priceTick) {
        priceRoot = curves_[0].priceRoot_;
        if (priceRoot > 0) {
            priceTick = TickMath.getTickAtSqrtRatio(priceRoot);
        }
    }

    function translateTickRange (int24 lowerTick, int24 upperTick)
        private pure returns (uint160 bidPrice, uint160 askPrice) {
        require(upperTick > lowerTick, "O");
        require(lowerTick >= TickMath.MIN_TICK, "I");
        require(upperTick <= TickMath.MAX_TICK, "X");
        bidPrice = TickMath.getSqrtRatioAtTick(lowerTick);
        askPrice = TickMath.getSqrtRatioAtTick(upperTick);
    }

    // Need to support at least 2 wei of precision round down when calculating quote
    // token reserve deltas. (See CurveMath's deltaPriceQuote() function.) 4 gives us a
    // safe cushion and is economically meaningless.
    uint256 constant TOKEN_ROUND = 4;
    
    function chargeConservative (uint256 liqBase, uint256 liqQuote)
        private pure returns (uint256, uint256) {
        return (liqBase > 0 ? liqBase + TOKEN_ROUND : 0,
                liqQuote > 0 ? liqQuote + TOKEN_ROUND : 0);
    }
}
