// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';
import '../libraries/PoolSpecs.sol';
import '../libraries/PriceGrid.sol';
import '../libraries/SwapCurve.sol';
import '../libraries/CurveMath.sol';
import '../libraries/CurveRoll.sol';
import '../libraries/Chaining.sol';
import '../interfaces/ICrocLpConduit.sol';
import './PositionRegistrar.sol';
import './LiquidityCurve.sol';
import './LevelBook.sol';
import './ColdInjector.sol';
import './AgentMask.sol';

import "hardhat/console.sol";

/* @title Trade matcher mixin
 * @notice Provides a unified facility for calling the core atomic trade actions
 *         on a pre-loaded liquidity curve:
 *           1) Mint amibent liquidity
 *           2) Mint range liquidity
 *           3) Burn ambient liquidity
 *           4) Burn range liquidity
 *           5) Swap                                                     */
contract TradeMatcher is PositionRegistrar, LiquidityCurve, LevelBook,
    AgentMask {

    using SafeCast for int256;
    using SafeCast for int128;
    using SafeCast for uint256;
    using SafeCast for uint128;
    using TickMath for uint128;
    using LiquidityMath for uint128;
    using PoolSpecs for PoolSpecs.Pool;
    using CurveRoll for CurveMath.CurveState;
    using CurveMath for CurveMath.CurveState;
    using SwapCurve for CurveMath.CurveState;
    using Directives for Directives.ConcentratedDirective;
    using Chaining for Chaining.PairFlow;

    /* @notice Mints ambient liquidity (i.e. liquidity that stays active at every
     *         price point) on to the curve.
     * 
     * @param curve The object representing the pre-loaded liquidity curve. Will be
     *              updated in memory after this call, but it's the caller's 
     *              responsbility to check it back into storage.
     * @param liqAdded The amount of ambient liquidity being minted represented as
     *                 sqrt(X*Y) where X,Y are the collateral reserves in a constant-
     *                 product AMM
     * @param poolHash The hash indexing the pool this liquidity curve applies to.
     * @param lpConduit The address of the ICrocLpConduit the LP position will be 
     *                  assigned to. (If zero the user will directly own the LP.)
     *
     * @return baseFlow The amount of base-side token collateral required by this
     *                  operations. Will always be positive indicating, a debit from
     *                  the user to the pool.
     * @return quoteFlow The amount of quote-side token collateral required by thhis
     *                   operation. */
    function mintAmbient (CurveMath.CurveState memory curve, uint128 liqAdded, 
                          bytes32 poolHash, address lpConduit)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        uint128 liqSeeds;
        (baseFlow, quoteFlow, liqSeeds) = mintAmbientAt(curve, liqAdded, poolHash,
                                                        agentMintKey(lpConduit));
        depositConduit(poolHash, liqSeeds, lpConduit);
    }

    function mintAmbient (CurveMath.CurveState memory curve, uint128 liqAdded, 
                          bytes32 poolHash)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        (baseFlow, quoteFlow, ) = mintAmbientAt(curve, liqAdded, poolHash,
                                                agentMintKey());
    }

    function mintAmbientAt (CurveMath.CurveState memory curve, uint128 liqAdded, 
                            bytes32 poolHash, bytes32 lpKey)
        private returns (int128 baseFlow, int128 quoteFlow, uint128 liqSeeds) {
        liqSeeds = mintPosLiq(lpKey, poolHash, liqAdded,
                              curve.seedDeflator_);
        (uint128 base, uint128 quote) = liquidityReceivable(curve, liqSeeds);
        (baseFlow, quoteFlow) = signMintFlow(base, quote);
    }

    /* @notice Like mintAmbient(), but the liquidity is permanetely locked into the pool,
     *         and therefore cannot be later burned by the user. */
    function lockAmbient (CurveMath.CurveState memory curve, uint128 liqAdded)
        internal pure returns (int128, int128) {
        (uint128 base, uint128 quote) = liquidityReceivable(curve, liqAdded);
        return signMintFlow(base, quote);        
    }

    /* @notice Burns ambient liquidity from the curve.
     * 
     * @param curve The object representing the pre-loaded liquidity curve. Will be
     *              updated in memory after this call, but it's the caller's 
     *              responsbility to check it back into storage.
     * @param liqAdded The amount of ambient liquidity being minted represented as
     *                 sqrt(X*Y) where X,Y are the collateral reserves in a constant-
     *                 product AMM
     * @param poolHash The hash indexing the pool this liquidity curve applies to.
     *
     * @return baseFlow The amount of base-side token collateral returned by this
     *                  operations. Will always be negative indicating, a credit from
     *                  the pool to the user.
     * @return quoteFlow The amount of quote-side token collateral returned by this
     *                   operation. */
    function burnAmbient (CurveMath.CurveState memory curve, uint128 liqBurned, 
                          bytes32 poolHash)
        internal returns (int128, int128) {
        uint128 liqSeeds = burnPosLiq(agentBurnKey(), poolHash,
                                      liqBurned, curve.seedDeflator_);
        (uint128 base, uint128 quote) = liquidityPayable(curve, liqSeeds);
        return signBurnFlow(base, quote);
    }

    /* @notice Mints concernated liquidity within a range on to the curve.
     * 
     * @param curve The object representing the pre-loaded liquidity curve. Will be
     *              updated in memory after this call, but it's the caller's 
     *              responsbility to check it back into storage.
     * @param prickTick The tick index of the curve's current price.
     * @param lowTick The tick index of the lower boundary of the range order.
     * @param highTick The tick index of the upper boundary of the range order.
     * @param liqAdded The amount of ambient liquidity being minted represented as
     *                 sqrt(X*Y) where X,Y are the collateral reserves in a constant-
     *                 product AMM
     * @param poolHash The hash indexing the pool this liquidity curve applies to.
     * @param lpConduit The address of the ICrocLpConduit the LP position will be 
     *                  assigned to. (If zero the user will directly own the LP.)
     *
     * @return baseFlow The amount of base-side token collateral required by this
     *                  operations. Will always be positive indicating, a debit from
     *                  the user to the pool.
     * @return quoteFlow The amount of quote-side token collateral required by thhis
     *                   operation. */
    function mintRange (CurveMath.CurveState memory curve, int24 priceTick,
                        int24 lowTick, int24 highTick, uint128 liquidity,
                        bytes32 poolHash, address lpConduit)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        uint64 mileage;

        (baseFlow, quoteFlow, mileage) = mintRangeAt
            (curve, priceTick, lowTick, highTick,
             liquidity, poolHash, agentMintKey(lpConduit));

        depositConduit(poolHash, lowTick, highTick, liquidity, mileage, lpConduit);
    }

    function mintRange (CurveMath.CurveState memory curve, int24 priceTick,
                        int24 lowTick, int24 highTick, uint128 liquidity,
                        bytes32 poolHash)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        (baseFlow, quoteFlow, ) = mintRangeAt(curve, priceTick, lowTick, highTick,
                                              liquidity, poolHash, agentMintKey());
    }

    function mintRangeAt (CurveMath.CurveState memory curve, int24 priceTick,
                          int24 lowTick, int24 highTick, uint128 liquidity,
                          bytes32 poolHash, bytes32 lpKey)
        private returns (int128 baseFlow, int128 quoteFlow, uint64 feeMileage) {
        feeMileage = addBookLiq(poolHash, priceTick, lowTick, highTick,
                                liquidity, curve.concGrowth_);
        mintPosLiq(lpKey, poolHash, lowTick, highTick,
                   liquidity, feeMileage);

        (uint128 base, uint128 quote) = liquidityReceivable
            (curve, liquidity, lowTick, highTick);
        (baseFlow, quoteFlow) = signMintFlow(base, quote);
    }

    /* @notice Dispatches the call to the ICrocLpConduit with the ambient liquidity 
     *         LP position that was minted. */
    function depositConduit (bytes32 poolHash, uint128 liqSeeds,
                             address lpConduit) private {
        depositConduit(poolHash, 0, 0, liqSeeds, 0, lpConduit);
    }

    /* @notice Dispatches the call to the ICrocLpConduit with the concentrated liquidity 
     *         LP position that was minted. */
    function depositConduit (bytes32 poolHash, int24 lowTick, int24 highTick,
                             uint128 liq, uint64 mileage, address lpConduit) private {
        if (lpConduit != address(0)) {
            bool doesAccept = ICrocLpConduit(lpConduit).
                depositCrocLiq(msg.sender, poolHash, lowTick, highTick, liq, mileage);
            require(doesAccept, "LP");
        }
    }

    /* @notice Burns concernated liquidity within a specific range off of the curve.
     * 
     * @param curve The object representing the pre-loaded liquidity curve. Will be
     *              updated in memory after this call, but it's the caller's 
     *              responsbility to check it back into storage.
     * @param prickTick The tick index of the curve's current price.
     * @param lowTick The tick index of the lower boundary of the range order.
     * @param highTick The tick index of the upper boundary of the range order.
     * @param liqAdded The amount of ambient liquidity being minted represented as
     *                 sqrt(X*Y) where X,Y are the collateral reserves in a constant-
     *                 product AMM
     * @param poolHash The hash indexing the pool this liquidity curve applies to.
     *
     * @return baseFlow The amount of base-side token collateral returned by this
     *                  operations. Will always be negative indicating, a credit from
     *                  the pool to the user.
     * @return quoteFlow The amount of quote-side token collateral returned by this
     *                   operation. */
    function burnRange (CurveMath.CurveState memory curve, int24 priceTick,
                        int24 lowTick, int24 highTick, uint128 liquidity,
                        bytes32 poolHash)
        internal returns (int128, int128) {
        uint64 feeMileage = removeBookLiq(poolHash, priceTick, lowTick, highTick,
                                          liquidity, curve.concGrowth_);
        uint64 rewards = burnPosLiq(agentBurnKey(), poolHash,
                                    lowTick, highTick, liquidity, feeMileage);
        (uint128 base, uint128 quote) = liquidityPayable(curve, liquidity, rewards,
                                                         lowTick, highTick);
        return signBurnFlow(base, quote);
    }

    /* @notice Harvests the accumulated rewards on a concentrated liquidity position.
     * 
     * @param curve The object representing the pre-loaded liquidity curve. Will be
     *              updated in memory after this call, but it's the caller's 
     *              responsbility to check it back into storage.
     * @param prickTick The tick index of the curve's current price.
     * @param lowTick The tick index of the lower boundary of the range order.
     * @param highTick The tick index of the upper boundary of the range order.
     * @param poolHash The hash indexing the pool this liquidity curve applies to.
     *
     * @return baseFlow The amount of base-side token collateral returned by this
     *                  operations. Will always be negative indicating, a credit from
     *                  the pool to the user.
     * @return quoteFlow The amount of quote-side token collateral returned by this
     *                   operation. */
    function harvestRange (CurveMath.CurveState memory curve, int24 priceTick,
                           int24 lowTick, int24 highTick, 
                           bytes32 poolHash)
        internal returns (int128, int128) {
        uint64 feeMileage = clockFeeOdometer(poolHash, priceTick, lowTick, highTick,
                                             curve.concGrowth_);
        uint128 rewards = harvestPosLiq(agentBurnKey(), poolHash,
                                       lowTick, highTick, feeMileage);
        (uint128 base, uint128 quote) = liquidityPayable(curve, rewards);
        return signBurnFlow(base, quote);
    }
    
    /* @notice Converts the unsigned flow associated with a mint operation to a pair
     *         net settlement flow. (Will always be positive because a mint requires use
     *         to pay collateral to the pool.) */
    function signMintFlow (uint128 base, uint128 quote) private pure
        returns (int128, int128) {
        return (base.toInt128Sign(), quote.toInt128Sign());
    }

    /* @notice Converts the unsigned flow associated with a burn operation to a pair
     *         net settlement flow. (Will always be negative because a burn requires use
     *         to pay collateral to the pool.) */
    function signBurnFlow (uint128 base, uint128 quote) private pure
        returns (int128, int128){
        return (-(base.toInt128Sign()), -(quote.toInt128Sign()));
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
     * @param accum The accumulator for the flows generated by the executable swap. 
     *              The realized flows on the swap will be written into the memory-based 
     *              accumulator fields of this struct. The caller is responsible for 
     *              ultaimtely paying and collecting those flows.
     * @param curve The starting liquidity curve state. Any changes created by the 
     *              swap on this struct are updated in memory. But the caller is 
     *              responsible for committing the final state to EVM storage.
     * @param midTick The price tick associated with the current price on the curve.
     * @param swap The user specified directive governing the size, direction and limit
     *             price of the swap to be executed.
     * @param pool The pool's market specification notably its swap fee rate and the
     *             protocol take rate. */
    function sweepSwapLiq (Chaining.PairFlow memory accum,
                           CurveMath.CurveState memory curve, int24 midTick,
                           Directives.SwapDirective memory swap,
                           PoolSpecs.PoolCursor memory pool) internal {
        require(swap.isBuy_ == (curve.priceRoot_ < swap.limitPrice_), "SD");
        
        // Keep iteratively executing more quantity until we either reach our limit price
        // or have zero quantity left to execute.
        bool doMore = true;
        while (doMore) {
            // Swap to furthest point we can based on the local bitmap. Don't bother
            // seeking a bump outside the local neighborhood yet, because we're not sure
            // if the swap will exhaust the bitmap.
            (int24 bumpTick, bool spillsOver) = pinBitmap
                (pool.hash_, swap.isBuy_, midTick);
            curve.swapToLimit(accum, swap, pool.head_, bumpTick);
            
            
            // The swap can be in one of four states at this point: 1) qty exhausted,
            // 2) limit price reached, 3) bump or barrier point reached on the curve.
            // The former two indicate the swap is complete. The latter means we have to
            // find the next bump point and possibly adjust AMM liquidity.
            doMore = hasSwapLeft(curve, swap);
            if (doMore) {

                // The spillsOver variable indicates that we reached stopped because we
                // reached the end of the local bitmap, rather than actually hitting a
                // level bump. Therefore we should query the global bitmap, find the next
                // bump point, and keep swapping across the constant-product curve until
                // if/when we hit that point.
                if (spillsOver) {
                    int24 liqTick = seekMezzSpill(pool.hash_, bumpTick, swap.isBuy_);
                    bool tightSpill = (bumpTick == liqTick);
                    bumpTick = liqTick;
                    
                    // In some corner cases the local bitmap border also happens to
                    // be the next bump point. If so, we're done with this inner section.
                    // Otherwise, we keep swapping since we still have some distance on
                    // the curve to cover until we reach a bump point.
                    if (!tightSpill) {
                        curve.swapToLimit(accum, swap, pool.head_, bumpTick);
                        doMore = hasSwapLeft(curve, swap);
                    }
                }
                
                // Perform book-keeping related to crossing the level bump, update
                // the locally tracked tick of the curve price (rather than wastefully
                // we calculating it since we already know it), then begin the swap
                // loop again.
                if (doMore) {
                    midTick = knockInTick(accum, bumpTick, curve, swap, pool.hash_);
                }
            }
        }
    }

    /* @notice Determines if we've terminated the swap execution. I.e. fully exhausted
     *         the specified swap quantity *OR* hit the directive's limit price. */
    function hasSwapLeft (CurveMath.CurveState memory curve,
                          Directives.SwapDirective memory swap)
        private pure returns (bool) {
        bool inLimit = swap.isBuy_ ?
            curve.priceRoot_ < swap.limitPrice_ :
            curve.priceRoot_ > swap.limitPrice_;
        return inLimit && (swap.qty_ > 0);
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
     * @param swap The user directive governing the size, direction and limit price of the
     *             swap to be executed.
     * @param poolHash The key hash mapping to the pool we're executive over. 
     *
     * @return The tick index that the curve and its price are living in after the call
     *         completes. */
    function knockInTick (Chaining.PairFlow memory accum, int24 bumpTick,
                          CurveMath.CurveState memory curve,
                          Directives.SwapDirective memory swap,
                          bytes32 poolHash) private
        returns (int24) {
        if (!Bitmaps.isTickFinite(bumpTick)) { return bumpTick; }
        bumpLiquidity(curve, bumpTick, swap.isBuy_, poolHash);

        (int128 paidBase, int128 paidQuote, uint128 burnSwap) =
            curve.shaveAtBump(swap.inBaseQty_, swap.isBuy_, swap.qty_);
        accum.accumFlow(paidBase, paidQuote);
        swap.qty_ -= burnSwap;

        // When selling down, the next tick leg actually occurs *below* the bump tick
        // because the bump barrier is the first price on a tick. 
        return swap.isBuy_ ? bumpTick : bumpTick - 1; 
    }

    /* @notice Performs the book-keeping related to crossing a concentrated liquidity 
     *         bump tick, and adjusts the in-memory curve object with the change of
     *         AMM liquidity. */
    function bumpLiquidity (CurveMath.CurveState memory curve,
                            int24 bumpTick, bool isBuy, bytes32 poolHash) private {
        int128 liqDelta = crossLevel(poolHash, bumpTick, isBuy,
                                     curve.concGrowth_);
        curve.concLiq_ = curve.concLiq_.addDelta(liqDelta);
    }    
}
