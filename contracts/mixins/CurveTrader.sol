// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';
import '../libraries/PoolSpecs.sol';
import '../libraries/PriceGrid.sol';
import '../libraries/SwapCurve.sol';
import '../libraries/CurveMath.sol';
import '../libraries/CurveRoll.sol';
import './PositionRegistrar.sol';
import './LiquidityCurve.sol';
import './LevelBook.sol';
import './ProtocolAccount.sol';
import './OracleHist.sol';

import "hardhat/console.sol";

contract CurveTrader is PositionRegistrar, LiquidityCurve,
    LevelBook, ProtocolAccount, OracleHistorian {

    using SafeCast for int256;
    using SafeCast for int128;
    using SafeCast for uint256;
    using SafeCast for uint128;
    using PoolSpecs for PoolSpecs.Pool;
    using SwapCurve for CurveMath.CurveState;
    using SwapCurve for CurveMath.SwapAccum;
    using CurveRoll for CurveMath.CurveState;
    using CurveMath for CurveMath.CurveState;
    using Directives for Directives.ConcentratedDirective;
    using PriceGrid for PriceGrid.ImproveSettings;

    function tradeOverPool (PoolSpecs.PoolCursor memory pool,
                            Directives.PoolDirective memory dir,
                            PriceGrid.ImproveSettings memory improve,
                            address owner)
        internal returns (int256 baseFlow, int256 quoteFlow,
                          uint256 baseProtoFlow, uint256 quoteProtoFlow) {
        CurveMath.CurveState memory curve = snapCurve(pool.hash_);
        (baseFlow, quoteFlow, baseProtoFlow, quoteProtoFlow) =
            applyToCurve(dir, pool, curve, improve, owner);
        commitCurve(pool.hash_, curve);
    }

    function initCurve (PoolSpecs.PoolCursor memory pool,
                        uint128 price, uint128 initLiq)
        internal returns (int256 baseFlow, int256 quoteFlow) {
        CurveMath.CurveState memory curve = snapCurveInit(pool.hash_);
        initPrice(curve, price);
        if (initLiq > 0) {
            (baseFlow, quoteFlow) = lockAmbient(initLiq, curve);
        }
        commitCurve(pool.hash_, curve);
    }

    function applyToCurve (Directives.PoolDirective memory dir,
                           PoolSpecs.PoolCursor memory pool,
                           CurveMath.CurveState memory curve, 
                           PriceGrid.ImproveSettings memory improve, address owner)
        private returns (int256 base, int256 quote,
                         uint256 protoBase, uint256 protoQuote) {
        int256 baseIncr;
        int256 quoteIncr;

        (base, quote, protoBase, protoQuote) = applySwap(dir.swap_, pool, curve);
        
        (baseIncr, quoteIncr) = applyAmbient(dir.ambient_, pool, curve, owner);
        base += baseIncr;
        quote += quoteIncr;

        (baseIncr, quoteIncr) = applyConcentrateds(dir.conc_, pool, curve,
                                                   improve, owner);
        base += baseIncr;
        quote += quoteIncr;
    }

    function applySwap (Directives.SwapDirective memory dir,
                        PoolSpecs.PoolCursor memory pool,
                        CurveMath.CurveState memory curve)
        private returns (int256 flowBase, int256 flowQuote,
                         uint256 protoBase, uint256 protoQuote) {
        if (dir.qty_ != 0) {
            CurveMath.SwapAccum memory accum = initSwapAccum(dir, pool, dir.qty_);
            sweepSwapLiq(curve, accum, pool, dir.limitPrice_);
            (flowBase, flowQuote) = (accum.paidBase_, accum.paidQuote_);
            (protoBase, protoQuote) = assignProtoFees(accum);            
        }
    }

    function assignProtoFees (CurveMath.SwapAccum memory accum) private pure
        returns (uint256 paidBase, uint256 paidQuote) {
        if (accum.cntx_.inBaseQty_) {
            paidQuote = accum.paidProto_;
        } else {
            paidBase = accum.paidProto_;
        }        
    }

    /* A swap operation is a potentially long and iterative process that
     * repeatedly writes updates data on both the curve state and the swap
     * accumulator. To conserve gas, the strategy is to initialize and track
     * these structures in memory. Then only commit them back to EVM storage
     * when the operation is finalized. */
    function initSwapAccum (Directives.SwapDirective memory dir,
                            PoolSpecs.PoolCursor memory pool, uint256 swapQty)
        private pure returns (CurveMath.SwapAccum memory accum) {
        CurveMath.SwapFrame memory cntx = CurveMath.SwapFrame
            ({isBuy_: dir.isBuy_, inBaseQty_: dir.inBaseQty_,
                    feeRate_: pool.head_.feeRate_, protoCut_: pool.head_.protocolTake_});
        accum = CurveMath.SwapAccum
            ({qtyLeft_: swapQty, cntx_: cntx,
                    paidBase_: 0, paidQuote_: 0, paidProto_: 0});
    }

    function applyAmbient (Directives.AmbientDirective memory dir,
                           PoolSpecs.PoolCursor memory pool,
                           CurveMath.CurveState memory curve, address owner)
        private returns (int256, int256) {

        if (dir.liquidity_ == 0) { return (0, 0); }
        if (dir.isAdd_) {
            return mintAmbient(dir.liquidity_, curve, pool, owner);
        } else {
            return burnAmbient(dir.liquidity_, curve, pool, owner);
        }
    }

    function applyConcentrateds (Directives.ConcentratedDirective[] memory dirs,
                                 PoolSpecs.PoolCursor memory pool,
                                 CurveMath.CurveState memory curve,
                                 PriceGrid.ImproveSettings memory improve, address owner)
        private returns (int256 baseFlow, int256 quoteFlow) {
        for (uint i = 0; i < dirs.length; ++i) {
            for (uint j = 0; j < dirs[i].bookends_.length; ++j) {
                Directives.RangeOrder memory range = dirs[i].sliceBookend(j);
                
                (int256 nextBase, int256 nextQuote) = applyConcentrated
                    (range, pool, curve, improve, owner);
                baseFlow += nextBase;
                quoteFlow += nextQuote;
            }
        }
    }

    function applyConcentrated (Directives.RangeOrder memory range,
                                PoolSpecs.PoolCursor memory pool,
                                CurveMath.CurveState memory curve,
                                PriceGrid.ImproveSettings memory improve, address owner)
        private returns (int256, int256) {
        int24 midTick = TickMath.getTickAtSqrtRatio(curve.priceRoot_);
        improve.verifyFit(range, pool.head_.tickSize_, midTick);

        if (range.liquidity_ == 0) { return (0, 0); }
        if (range.isAdd_) {
            return mintConcentrated(midTick, range.lowerTick_, range.upperTick_,
                                    range.liquidity_, curve, pool, owner);
        } else {
            return burnConcentrated(midTick, range.lowerTick_, range.upperTick_,
                                    range.liquidity_, curve, pool, owner);
        }
    }

    function mintAmbient (uint128 liqAdded, CurveMath.CurveState memory curve,
                          PoolSpecs.PoolCursor memory pool, address owner)
        private returns (int256, int256) {
        mintPosLiq(owner, pool.hash_, liqAdded, curve.accum_.ambientGrowth_);
        (uint256 base, uint256 quote) = liquidityReceivable(curve, liqAdded);
        return signMintFlow(base, quote);
    }

    function lockAmbient (uint128 liqAdded, CurveMath.CurveState memory curve)
        private pure returns (int256, int256) {
        (uint256 base, uint256 quote) = liquidityReceivable(curve, liqAdded);
        return signMintFlow(base, quote);        
    }

    function burnAmbient (uint128 liqBurned, CurveMath.CurveState memory curve,
                          PoolSpecs.PoolCursor memory pool, address owner)
        private returns (int256, int256) {
        burnPosLiq(owner, pool.hash_, liqBurned, curve.accum_.ambientGrowth_);
        (uint256 base, uint256 quote) = liquidityPayable(curve, liqBurned);
        return signBurnFlow(base, quote);
    }
    
    function mintConcentrated (int24 midTick, int24 lowerTick, int24 upperTick,
                               uint128 liq, CurveMath.CurveState memory curve,
                               PoolSpecs.PoolCursor memory pool, address owner)
        private returns (int256, int256) {
        uint64 feeMileage = addBookLiq(pool.hash_, midTick, lowerTick, upperTick,
                                       liq, curve.accum_.concTokenGrowth_);
        mintPosLiq(owner, pool.hash_, lowerTick, upperTick, liq, feeMileage);
        (uint256 base, uint256 quote) = liquidityReceivable
            (curve, liq, lowerTick, upperTick);
        return signMintFlow(base, quote);
    }

    function burnConcentrated (int24 midTick, int24 lowerTick, int24 upperTick,
                               uint128 liq,  CurveMath.CurveState memory curve,
                               PoolSpecs.PoolCursor memory pool, address owner)
        private returns (int256, int256) {
        uint64 feeMileage = removeBookLiq(pool.hash_, midTick, lowerTick, upperTick,
                                          liq, curve.accum_.concTokenGrowth_);
        uint64 rewards = burnPosLiq(owner, pool.hash_, lowerTick, upperTick,
                                    liq, feeMileage); 
        (uint256 base, uint256 quote) = liquidityPayable(curve, liq, rewards,
                                                         lowerTick, upperTick);
        return signBurnFlow(base, quote);
    }

    function signMintFlow (uint256 base, uint256 quote) private pure
        returns (int256, int256) {
        return (base.toInt256(), quote.toInt256());
    }

    function signBurnFlow (uint256 base, uint256 quote) private pure
        returns (int256, int256){
        return (-(base.toInt256()), -(quote.toInt256()));
    }

    /* @notice Executes the pending swap through the order book, adjusting the
     *         liquidity curve and level book as needed based on the swap's impact.
     *
     * @dev This is probably the most complex single function in the codebase. For
     *      small local moves, which don't cross extant levels in the book, it acts
     *      like a constant-product AMM curve. For large swaps which cross levels,
     *      it iteratively re-adjusts the AMM curve on every level cross, and performs
     *      the necessary book-keeping on each crossed level entry.
     *
     * @param curve The starting liquidity curve state. Any changes created by the 
     *              swap on this struct are updated in memory. But the caller is 
     *              responsible for committing the final state to EVM storage.
     * @param accum The specification for the executable swap. The realized flows
     *              on the swap will be written into the memory-based accumulator
     *              fields of this struct. The caller is responsible for paying and
     *              collecting those flows.
     * @param limitPrice The limit price of the swap. Expressed as the square root of
     *     the price in FixedPoint96. Important to note that this represents the limit
     *     of the final price of the *curve*. NOT the realized VWAP price of the swap.
     *     The swap will only ever execute up the maximum size which would keep the curve
     *     price within this bound, even if the specified quantity is higher. */
    function sweepSwapLiq (CurveMath.CurveState memory curve,
                           CurveMath.SwapAccum memory accum,
                           PoolSpecs.PoolCursor memory pool,
                           uint128 limitPrice) internal {
        bool isBuy = accum.cntx_.isBuy_;
        int24 midTick = TickMath.getTickAtSqrtRatio(curve.priceRoot_);
        
        // Keep iteratively executing more quantity until we either reach our limit price
        // or have zero quantity left to execute.
        while (hasSwapLeft(curve, accum, limitPrice)) {
            // Swap to furthest point we can based on the local bitmap. Don't bother
            // seeking a bump outside the bump, because we're not sure if the swap will
            // exhaust the bitmap. 
            (int24 bumpTick, bool spillsOver) = pinTickMap(pool.hash_, isBuy, midTick);
            curve.swapToLimit(accum, bumpTick, limitPrice);

            // The swap can be in one of three states at this point: 1) qty exhausted,
            // 2) limit price reached, or 3) AMM liquidity bump hit. The former two mean
            // the swap is complete. The latter means that we have adust AMM liquidity,
            // and find the next liquidity bump.
            bool atBump = hasSwapLeft(curve, accum, limitPrice);
            
            // The swap can be in one of three states at this point: 1) qty exhausted,
            // 2) limit price reached, or 3) AMM liquidity bump hit. The former two mean
            // the swap is complete. The latter means that we have adust AMM liquidity,
            // and find the next liquidity bump.
            if (atBump) {

                // The spills over variable indicates that we reaced the end of the
                // local bitmap, rather than actually hitting a level bump. Therefore
                // we should query the global bitmap, find the next level bitmap, and
                // keep swapping on the constant-product curve until we hit point.
                if (spillsOver) {
                    (int24 liqTick, bool tightSpill) = seekTickSpill(pool.hash_,
                                                                     bumpTick, isBuy);
                    bumpTick = liqTick;
                    
                    // In some corner cases the local bitmap border also happens to
                    // be the next level bump. In which case we're done. Otherwise,
                    // we keep swapping since we still have some distance on the curve
                    // to cover.
                    if (!tightSpill) {
                        curve.swapToLimit(accum, bumpTick, limitPrice);
                        atBump = hasSwapLeft(curve, accum, limitPrice);
                    }
                }
                
                // Perform book-keeping related to crossing the level bump, update
                // the locally tracked tick of the curve price (rather than wastefully
                // we calculating it since we already know it), then begin the swap
                // loop again.
                if (atBump) {
                    midTick = knockInTick(bumpTick, isBuy, curve, accum, pool);
                }
            }
        }
    }

    function hasSwapLeft (CurveMath.CurveState memory curve,
                          CurveMath.SwapAccum memory accum,
                          uint128 limitPrice) private pure returns (bool) {
        return accum.qtyLeft_ > 0 &&
            inLimitPrice(curve.priceRoot_, limitPrice, accum.cntx_.isBuy_);
    }
    
    function inLimitPrice (uint128 price, uint128 limitPrice, bool isBuy)
        private pure returns (bool) {
        return isBuy ? price < limitPrice : price > limitPrice;
    }


    /* @notice Performs all the necessary book keeping related to crossing an extant 
     *         level bump on the curve. 
     *
     * @dev Note that this function updates the level book data structure directly on
     *      the EVM storage. But it only updates the liquidity curve state *in memory*.
     *      This is for gas efficiency reasons, as the same curve struct may be updated
     *      many times in a single swap. The caller must take responsibility for 
     *      committing the final curve state back to EVM storage. 
     *
     * @params bumpTick The tick index where the bump occurs.
     * @params isBuy The direction the bump happens from. If true, curve's price is 
     *               moving through the bump starting from a lower price and going to a
     *               higher price. If false, the opposite.
     * @params curve The pre-bump state of the local constant-product AMM curve. Updated
     *               to reflect the liquidity added/removed from rolling through the
     *               bump.
     * @return The tick index that the curve and its price are living in after the call
     *         completes. */
    function knockInTick (int24 bumpTick, bool isBuy,
                          CurveMath.CurveState memory curve,
                          CurveMath.SwapAccum memory accum,
                          PoolSpecs.PoolCursor memory pool) private returns (int24) {
        if (!Bitmaps.isTickFinite(bumpTick)) { return bumpTick; }
        bumpLiquidity(bumpTick, isBuy, curve, pool);
        curve.shaveAtBump(accum);
        return postBumpTick(bumpTick, isBuy);
    }

    function bumpLiquidity (int24 bumpTick, bool isBuy, 
                            CurveMath.CurveState memory curve,
                            PoolSpecs.PoolCursor memory pool) private {
        int256 liqDelta = crossLevel(pool.hash_, bumpTick, isBuy,
                                     curve.accum_.concTokenGrowth_);
        curve.liq_.concentrated_ = LiquidityMath.addDelta
            (curve.liq_.concentrated_, liqDelta.toInt128());
    }
    
    // When selling down, the next tick leg actually occurs *below* the bump tick
    // because the bump barrier is the first price on a tick. 
    function postBumpTick (int24 bumpTick, bool isBuy) private pure returns (int24) {
        return isBuy ? bumpTick : bumpTick - 1; 
    }


    mapping(bytes32 => PoolSpecs.Pool) private pools_;
}
