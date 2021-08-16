// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.7.6;
pragma experimental ABIEncoderV2;

import '../libraries/FullMath.sol';
import '../libraries/TickMath.sol';
import '../libraries/FixedPoint96.sol';
import '../libraries/LiquidityMath.sol';
import '../libraries/SafeCast.sol';
import '../libraries/LowGasSafeMath.sol';
import '../libraries/CurveMath.sol';

contract LiquidityCurve {
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using SafeCast for uint256;
    using SafeCast for uint128;
    using SafeCast for int256;
    using CurveMath for CurveMath.CurveState;

    CurveMath.CurveState private curve_;

    function activeLiquidity() view internal returns (uint128) {
        return curve_.activeLiquidity();
    }

    function tokenOdometer() view internal returns (uint256) {
        return curve_.accum_.concTokenGrowth_;
    }

    function snapCurve() view internal returns (CurveMath.CurveState memory curve) {
        curve = curve_;
        require(curve.priceRoot_ > 0, "J");
    }

    function commitSwapCurve (CurveMath.CurveState memory curve) internal {
        curve_.priceRoot_ = curve.priceRoot_;
        curve_.accum_ = curve.accum_;
        if (curve_.liq_.ambientSeed_ != curve.liq_.ambientSeed_ ||
            curve_.liq_.concentrated_ != curve.liq_.concentrated_) {
            curve_.liq_ = curve.liq_;
        }
    }
    

    function liquidityReceivable (uint128 liquidity,
                                  int24 lowerTick, int24 upperTick)
        internal returns (uint256, uint256) {
        (uint256 base, uint256 quote) = liquidityFlows(liquidity, lowerTick, upperTick);
        bumpConcentrated(liquidity, base, quote);
        return chargeConservative(base, quote);
    }

    function liquidityReceivable (uint128 seeds) 
        internal returns (uint256, uint256) {
        (uint256 base, uint256 quote) = liquidityFlows(seeds);
        bumpAmbient(seeds);
        return chargeConservative(base, quote);
    }

    function liquidityPayable (uint128 liquidity, uint256 rewardRate,
                               int24 lowerTick, int24 upperTick)
        internal returns (uint256 base, uint256 quote) {
        (base, quote) = liquidityPayable(liquidity, lowerTick, upperTick);

        if (rewardRate > 0) {
            uint256 rewards = FullMath.mulDiv(liquidity, rewardRate, FixedPoint128.Q128);
            if (rewards > 0) {
                (uint256 baseRewards, uint256 quoteRewards) =
                    liquidityPayable(rewards.toUint128());
                base += baseRewards;
                quote += quoteRewards;
            }
        }
    }
    
    function liquidityPayable (uint128 liquidity,
                               int24 lowerTick, int24 upperTick)
        internal returns (uint256 base, uint256 quote) {
        (base, quote) = liquidityFlows(liquidity, lowerTick, upperTick);
        bumpConcentrated(-(liquidity.toInt256()), base, quote);
    }

    function liquidityPayable (uint128 seeds)
        internal returns (uint256 base, uint256 quote) {
        (base, quote) = liquidityFlows(seeds);
        bumpAmbient(-(seeds.toInt256()));
    }

    function bumpAmbient (int256 seedDelta) private {
        curve_.liq_.ambientSeed_ = LiquidityMath.addDelta
            (curve_.liq_.ambientSeed_, seedDelta.toInt128());
    }

    function bumpConcentrated (int256 liqDelta, uint256 base,
                               uint256 quote) private {
        if (base > 0 && quote > 0) {
            uint128 prevLiq = curve_.liq_.concentrated_;
            uint128 nextLiq = LiquidityMath.addDelta
                (prevLiq, liqDelta.toInt128());
            curve_.liq_.concentrated_ = nextLiq;
        }
    }
    

    function liquidityFlows (uint128 liquidity,
                             int24 bidTick, int24 askTick)
        private view returns (uint256 baseDebit, uint256 quoteDebit) {
        (uint160 price, int24 tick) = loadPriceTick();
        (uint160 bidPrice, uint160 askPrice) =
            translateTickRange(bidTick, askTick);

        if (tick < bidTick) {
            quoteDebit = liqQuoteDelta(liquidity, bidPrice, askPrice);
        } else if (tick > askTick) {
            baseDebit = liqBaseDelta(liquidity, bidPrice, askPrice);
        } else {
            quoteDebit = liqQuoteDelta(liquidity, price, askPrice);
            baseDebit = liqBaseDelta(liquidity, bidPrice, price);
        }
    }
    
    function liquidityFlows (uint128 seeds)
        private view returns (uint256 baseDebit, uint256 quoteDebit) {
        uint160 price  = curve_.priceRoot_;
        uint128 liq = LiquidityMath.inflateSeed(seeds, curve_.accum_.ambientGrowth_);
        baseDebit = FullMath.mulDiv(liq, price, FixedPoint96.Q96);
        quoteDebit = (uint256(liq) << FixedPoint96.RESOLUTION) / price;
    }
    
    function liqBaseDelta (uint128 liquidity,
                            uint160 bidPrice, uint160 askPrice)
        private pure returns (uint256) {
        return FullMath.mulDiv(liquidity, askPrice - bidPrice,
                               FixedPoint96.Q96);
    }

    function liqQuoteDelta (uint128 liquidity,
                            uint160 bidPrice, uint160 askPrice)
        private pure returns (uint256) {
        uint256 term = FullMath.mulDiv(askPrice - bidPrice,
                                       FixedPoint96.Q96, bidPrice);
        return FullMath.mulDiv(term, liquidity, askPrice);
    }

    function updatePrice (uint160 priceRoot) internal returns (int24 priceTick) {
        require(curve_.priceRoot_ > 0, "J");
        curve_.priceRoot_ = priceRoot;
        priceTick = TickMath.getTickAtSqrtRatio(priceRoot);
    }

    function initPrice (uint160 priceRoot) internal {
        require(curve_.priceRoot_ == 0, "N");
        curve_.priceRoot_ = priceRoot;
    }
    
    function loadPriceTick() internal view
        returns (uint160 priceRoot, int24 priceTick) {
        (priceRoot, priceTick) = loadPriceTickMaybe();
        require(priceRoot > 0, "J");
    }

    function loadPriceTickMaybe() internal view
        returns (uint160 priceRoot, int24 priceTick) {
        priceRoot = curve_.priceRoot_;
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

    function chargeConservative (uint256 liqBase, uint256 liqQuote)
        private pure returns (uint256, uint256) {
        return (liqBase > 0 ? liqBase + 1 : 0,
                liqQuote > 0 ? liqQuote + 1 : 0);
    }
}
