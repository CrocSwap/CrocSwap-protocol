// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';
import '../libraries/PoolSpecs.sol';
import '../libraries/PriceGrid.sol';
import '../libraries/SwapCurve.sol';
import '../libraries/CurveMath.sol';
import '../libraries/CurveRoll.sol';
import '../libraries/CurveCache.sol';
import '../libraries/Chaining.sol';
import './PositionRegistrar.sol';
import './LiquidityCurve.sol';
import './LevelBook.sol';
import './ColdInjector.sol';
import './TradeMatcher.sol';

import '../interfaces/ICrocSwapHistRecv.sol';

import "hardhat/console.sol";

contract MarketSequencer is TradeMatcher {

    using SafeCast for int256;
    using SafeCast for int128;
    using SafeCast for uint256;
    using SafeCast for uint128;
    using TickMath for uint128;
    using PoolSpecs for PoolSpecs.Pool;
    using SwapCurve for CurveMath.CurveState;
    using SwapCurve for CurveMath.SwapAccum;
    using CurveRoll for CurveMath.CurveState;
    using CurveMath for CurveMath.CurveState;
    using CurveCache for CurveCache.Cache;
    using Directives for Directives.ConcentratedDirective;
    using PriceGrid for PriceGrid.ImproveSettings;
    using Chaining for Chaining.PairFlow;
    using Chaining for Chaining.RollTarget;
    
    function tradeOverPool (Chaining.PairFlow memory flow,
                            Directives.PoolDirective memory dir,
                            Chaining.ExecCntx memory cntx) internal {
        CurveCache.Cache memory curve;
        curve.curve_ = snapCurve(cntx.pool_.hash_);
        applyToCurve(flow, dir, curve, cntx);
        commitCurve(cntx.pool_.hash_, curve.curve_);
    }

    function swapOverPool (Directives.SwapDirective memory dir,
                           PoolSpecs.PoolCursor memory pool)
        internal returns (Chaining.PairFlow memory flow) {
        CurveMath.CurveState memory curve = snapCurve(pool.hash_);
        sweepSwapLiq(flow, curve, curve.priceRoot_.getTickAtSqrtRatio(), dir, pool);
        commitCurve(pool.hash_, curve);
    }

    function mintOverPool (int24 bidTick, int24 askTick, uint128 liq,
                           PoolSpecs.PoolCursor memory pool)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        CurveMath.CurveState memory curve = snapCurve(pool.hash_);
        (baseFlow, quoteFlow) =
            mintRange(curve, curve.priceRoot_.getTickAtSqrtRatio(),
                      bidTick, askTick, liq, pool.hash_);
        PriceGrid.verifyFit(bidTick, askTick, pool.head_.tickSize_);
        commitCurve(pool.hash_, curve);
    }

    function burnOverPool (int24 bidTick, int24 askTick, uint128 liq,
                           PoolSpecs.PoolCursor memory pool)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        CurveMath.CurveState memory curve = snapCurve(pool.hash_);
        (baseFlow, quoteFlow) =
            burnRange(curve, curve.priceRoot_.getTickAtSqrtRatio(),
                      bidTick, askTick, liq, pool.hash_);
        commitCurve(pool.hash_, curve);
    }

    function mintOverPool (uint128 liq, PoolSpecs.PoolCursor memory pool)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        CurveMath.CurveState memory curve = snapCurve(pool.hash_);
        (baseFlow, quoteFlow) =
            mintAmbient(curve, liq, pool.hash_);
        commitCurve(pool.hash_, curve);
    }
    
    function burnOverPool (uint128 liq, PoolSpecs.PoolCursor memory pool)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        CurveMath.CurveState memory curve = snapCurve(pool.hash_);
        (baseFlow, quoteFlow) =
            burnAmbient(curve, liq, pool.hash_);
        commitCurve(pool.hash_, curve);
    }

    function initCurve (PoolSpecs.PoolCursor memory pool,
                        uint128 price, uint128 initLiq)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        CurveMath.CurveState memory curve = snapCurveInit(pool.hash_);
        initPrice(curve, price);
        if (initLiq > 0) {
            (baseFlow, quoteFlow) = lockAmbient(curve, initLiq);
        }
        commitCurve(pool.hash_, curve);
    }

    function applyToCurve (Chaining.PairFlow memory flow,
                           Directives.PoolDirective memory dir,
                           CurveCache.Cache memory curve,
                           Chaining.ExecCntx memory cntx) private {
        if (!dir.chain_.swapDefer_) {
            applySwap(flow, dir.swap_, curve, cntx);
        }
        applyAmbient(flow, dir.ambient_, curve, cntx);
        applyConcentrateds(flow, dir.conc_, curve, cntx);
        if (dir.chain_.swapDefer_) {
            applySwap(flow, dir.swap_, curve, cntx);
        }
    }

    function applySwap (Chaining.PairFlow memory flow,
                        Directives.SwapDirective memory dir,
                        CurveCache.Cache memory curve,
                        Chaining.ExecCntx memory cntx) private {
        if (isRoll(dir)) {
            cntx.roll_.plugSwapGap(dir, flow);
        }
        if (dir.qty_ != 0) {
            callSwap(flow, curve, dir, cntx.pool_);            
        }
    }

    function isRoll (Directives.SwapDirective memory dir) private pure returns (bool) {
        return dir.limitPrice_ > 0 && dir.qty_ == 0;
    }

    function applyAmbient (Chaining.PairFlow memory flow,
                           Directives.AmbientDirective memory dir,
                           CurveCache.Cache memory curve,
                           Chaining.ExecCntx memory cntx) private {
        (uint128 liq, bool isAdd) = (dir.liquidity_, dir.isAdd_);

        if (isRoll(liq, isAdd)) {
            (liq, isAdd) = cntx.roll_.plugLiquidity(curve.curve_, flow);
        }
        
        if (liq > 0) {
            (int128 base, int128 quote) = isAdd ?
                callMintAmbient(curve, liq, cntx.pool_.hash_) :
                callBurnAmbient(curve, liq, cntx.pool_.hash_);
        
            flow.accumFlow(base, quote);
        }
    }

    function applyConcentrateds (Chaining.PairFlow memory flow,
                                 Directives.ConcentratedDirective[] memory dirs,
                                 CurveCache.Cache memory curve,
                                 Chaining.ExecCntx memory cntx) private {
        for (uint i = 0; i < dirs.length; ++i) {
            for (uint j = 0; j < dirs[i].bookends_.length; ++j) {
                (int24 lowTick, int24 highTick, bool isAdd, uint128 liquidity) =
                    dirs[i].sliceBookend(j);

                (int128 nextBase, int128 nextQuote) = applyConcentrated
                    (curve, flow, cntx, lowTick, highTick, isAdd, liquidity);
                flow.accumFlow(nextBase, nextQuote);
            }
        }
    }

    function applyConcentrated (CurveCache.Cache memory curve,
                                Chaining.PairFlow memory flow,
                                Chaining.ExecCntx memory cntx,
                                int24 lowTick, int24 highTick, bool isAdd, uint128 liq)
        private returns (int128, int128) {
        if (isRoll(liq, isAdd)) {
            (liq, isAdd) = Chaining.plugLiquidity(cntx.roll_, curve.curve_,
                                                  flow, lowTick, highTick);
        }

        if (isAdd) {
            cntx.improve_.verifyFit(lowTick, highTick, liq,
                                    cntx.pool_.head_.tickSize_,
                                    curve.pullPriceTick());
        }

        if (liq == 0) { return (0, 0); }
        return isAdd ?
            callMintRange(curve, lowTick, highTick, liq, cntx.pool_.hash_) :
            callBurnRange(curve, lowTick, highTick, liq, cntx.pool_.hash_);
    }

    function isRoll (uint128 liq, bool isAdd) private pure returns (bool) {
        return liq == 0 && isAdd == true;
    }

}
