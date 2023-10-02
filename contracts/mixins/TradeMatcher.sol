// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import '../libraries/Directives.sol';
import '../libraries/PoolSpecs.sol';
import '../libraries/PriceGrid.sol';
import '../libraries/SwapCurve.sol';
import '../libraries/CurveMath.sol';
import '../libraries/CurveRoll.sol';
import '../libraries/Chaining.sol';
import '../interfaces/ICrocLpConduit.sol';
import './LiquidityMining.sol';
import './LiquidityCurve.sol';
import './LevelBook.sol';
import './KnockoutCounter.sol';
import './ProxyCaller.sol';
import './AgentMask.sol';

/* @title Trade matcher mixin
 * @notice Provides a unified facility for calling the core atomic trade actions
 *         on a pre-loaded liquidity curve:
 *           1) Mint amibent liquidity
 *           2) Mint range liquidity
 *           3) Burn ambient liquidity
 *           4) Burn range liquidity
 *           5) Swap                                                     */
contract TradeMatcher is LiquidityMining, LiquidityCurve, KnockoutCounter,
    ProxyCaller {

    using SafeCast for int256;
    using SafeCast for int128;
    using SafeCast for uint256;
    using SafeCast for uint128;
    using TickMath for uint128;
    using LiquidityMath for uint96;
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
     * @param lpOwner The address of the ICrocLpConduit the LP position will be 
     *                assigned to. (If zero the user will directly own the LP.)
     *
     * @return baseFlow The amount of base-side token collateral required by this
     *                  operations. Will always be positive indicating, a debit from
     *                  the user to the pool.
     * @return quoteFlow The amount of quote-side token collateral required by thhis
     *                   operation. */
    function mintAmbient (CurveMath.CurveState memory curve, uint128 liqAdded, 
                          bytes32 poolHash, address lpOwner)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        // Can be used to increase position, need to accrue first
        accrueAmbientGlobalTimeWeightedLiquidity(poolHash, curve);
        accrueAmbientPositionTimeWeightedLiquidity(payable(lpOwner), poolHash);
        uint128 liqSeeds = mintPosLiq(lpOwner, poolHash, liqAdded,
                                      curve.seedDeflator_);
        depositConduit(poolHash, liqSeeds, curve.seedDeflator_, lpOwner);

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
                          bytes32 poolHash, address lpOwner)
        internal returns (int128, int128) {
        accrueAmbientGlobalTimeWeightedLiquidity(poolHash, curve);
        accrueAmbientPositionTimeWeightedLiquidity(payable(lpOwner), poolHash);
        uint128 liqSeeds = burnPosLiq(lpOwner, poolHash, liqBurned, curve.seedDeflator_);
        withdrawConduit(poolHash, liqSeeds, curve.seedDeflator_, lpOwner);
        
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
                        bytes32 poolHash, address lpOwner)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        uint72 feeMileage = addBookLiq72(poolHash, priceTick, lowTick, highTick,
                                       liquidity.liquidityToLots(),
                                       curve.concGrowth_);
        
        accrueConcentratedGlobalTimeWeightedLiquidity(poolHash, curve);
        // Can be used to increase position, need to accrue first
        accrueConcentratedPositionTimeWeightedLiquidity(payable(lpOwner), poolHash, lowTick, highTick);
        mintPosLiq(lpOwner, poolHash, lowTick, highTick,
                     liquidity, feeMileage);
        depositConduit(poolHash, lowTick, highTick, liquidity, feeMileage, lpOwner);

        (uint128 base, uint128 quote) = liquidityReceivable
            (curve, liquidity, lowTick, highTick);
        (baseFlow, quoteFlow) = signMintFlow(base, quote);
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
                        bytes32 poolHash, address lpOwner)
        internal returns (int128, int128) {
        uint72 feeMileage = removeBookLiq72(poolHash, priceTick, lowTick, highTick,
                                          liquidity.liquidityToLots(),
                                          curve.concGrowth_);
        accrueConcentratedGlobalTimeWeightedLiquidity(poolHash, curve);
        accrueConcentratedPositionTimeWeightedLiquidity(payable(lpOwner), poolHash, lowTick, highTick);
        uint64 rewards = burnPosLiq(lpOwner, poolHash, lowTick, highTick, liquidity,
                                    feeMileage);
        withdrawConduit(poolHash, lowTick, highTick,
                        liquidity, feeMileage, lpOwner);
        (uint128 base, uint128 quote) = liquidityPayable(curve, liquidity, rewards,
                                                         lowTick, highTick);
        return signBurnFlow(base, quote);
    }

    /* @notice Dispatches the call to the ICrocLpConduit with the ambient liquidity 
     *         LP position that was minted. */
    function depositConduit (bytes32 poolHash, uint128 liqSeeds, uint72 deflator,
                             address lpConduit) private {
        // Equivalent to calling concentrated liquidity deposit with lowTick=0 and highTick=0
        // Since a true range order can never have a width of zero, the receiving deposit
        // contract should recognize these values as always representing ambient liquidity
        int24 NA_LOW_TICK = 0;
        int24 NA_HIGH_TICK = 0;
        depositConduit(poolHash, NA_LOW_TICK, NA_HIGH_TICK, liqSeeds, deflator, lpConduit);
    }

    /* @notice Dispatches the call to the ICrocLpConduit with the concentrated liquidity 
     *         LP position that was minted. */
    function depositConduit (bytes32 poolHash, int24 lowTick, int24 highTick,
                             uint128 liq, uint72 mileage, address lpConduit) private {
        if (lpConduit != lockHolder_) {
            bool doesAccept = ICrocLpConduit(lpConduit).
                depositCrocLiq(lockHolder_, poolHash, lowTick, highTick, liq, mileage);
            require(doesAccept, "LP");
        }
    }

    /* @notice Withdraws and sends ownership of the ambient liquidity to a third party conduit
     *         explicitly nominated by the caller. */
    function withdrawConduit (bytes32 poolHash, uint128 liqSeeds, uint72 deflator,
                              address lpConduit) private {
        withdrawConduit(poolHash, 0, 0, liqSeeds, deflator, lpConduit);
    }

    /* @notice Withdraws and sends ownership of the liquidity to a third party conduit
     *         explicitly nominated by the caller. */
    function withdrawConduit (bytes32 poolHash, int24 lowTick, int24 highTick,
                              uint128 liq, uint72 mileage, address lpConduit) private {
        if (lpConduit != lockHolder_) {
            bool doesAccept = ICrocLpConduit(lpConduit).
                withdrawCrocLiq(lockHolder_, poolHash, lowTick, highTick, liq, mileage);
            require(doesAccept, "LP");
        }
    }

    /* @notice Mints a new knockout liquidity position, or adds to a previous position, 
     *         and updates the curve and debit flows accordingly.
     *
     * @param curve The current state of the liquidity curve.
     * @param priceTick The 24-bit tick of the pool's current price
     * @param loc The location of where to mint the knockout liquidity
     * @param liquidity The total amount of XY=K liquidity to mint.
     * @param poolHash The hash of the pool the curve applies to
     * @param knockoutBits The bitwise knockout parameters currently set on the pool.
     *
     * @return The incrmental base and quote debit flows from this action. */
    function mintKnockout (CurveMath.CurveState memory curve, int24 priceTick,
                           KnockoutLiq.KnockoutPosLoc memory loc,
                           uint128 liquidity, bytes32 poolHash, uint8 knockoutBits)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        accrueConcentratedGlobalTimeWeightedLiquidity(poolHash, curve);
        addKnockoutLiq(poolHash, knockoutBits, priceTick, curve.concGrowth_, loc,
                       liquidity.liquidityToLots());
        
        (uint128 base, uint128 quote) = liquidityReceivable
            (curve, liquidity, loc.lowerTick_, loc.upperTick_);
        (baseFlow, quoteFlow) = signMintFlow(base, quote);
    }

    /* @notice Burns an existing knockout liquidity position and updates the curve
     *         and flows accordingly.
     *
     * @param curve The current state of the liquidity curve.
     * @param priceTick The 24-bit tick of the pool's current price
     * @param loc The location of where to burn the knockout liquidity from
     * @param liquidity The total amount of XY=K liquidity to mint.
     * @param poolHash The hash of the pool the curve applies to
     *
     * @return The incrmental base and quote debit flows from this action. */
    function burnKnockout (CurveMath.CurveState memory curve, int24 priceTick,
                           KnockoutLiq.KnockoutPosLoc memory loc,
                           uint128 liquidity, bytes32 poolHash)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        (, , uint64 rewards) = rmKnockoutLiq(poolHash, priceTick, curve.concGrowth_,
                                             loc, liquidity.liquidityToLots());
        
        accrueConcentratedGlobalTimeWeightedLiquidity(poolHash, curve);
        (uint128 base, uint128 quote) = liquidityPayable
            (curve, liquidity, rewards, loc.lowerTick_, loc.upperTick_);
        (baseFlow, quoteFlow) = signBurnFlow(base, quote);
    }

    /* @notice Claims a post-knockout liquidity position using the ownership Merkle proof
     *         supplied by the caller.
     *
     * @param curve The current state of the liquidity curve.
     * @param loc The location of where the post-knockout position was placed
     * @param root The root of the supplied Merkle proof
     * @param proof The Merkle proof that combined with the root must match the current
     *              hash of the knockout slot
     * @param poolHash The hash of the pool the curve applies to
     *
     * @return The incrmental base and quote debit flows from this action. */
    function claimKnockout (CurveMath.CurveState memory curve, 
                            KnockoutLiq.KnockoutPosLoc memory loc,
                            uint160 root, uint256[] memory proof, bytes32 poolHash)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        (uint96 lots, uint64 rewards) = claimPostKnockout(poolHash, loc, root, proof);
        uint128 liquidity = lots.lotsToLiquidity();
        
        (uint128 base, uint128 quote) = liquidityHeldPayable
            (curve, liquidity, rewards, loc);
        (baseFlow, quoteFlow) = signBurnFlow(base, quote);
    }

    /* @notice Claims a post-knockout liquidity position using the ownership Merkle proof
     *         supplied by the caller.
     *
     * @param curve The current state of the liquidity curve.
     * @param loc The location of where the post-knockout position was placed
     * @param root The root of the supplied Merkle proof
     * @param pivotTime The pivotTime of the knockout slot at the time the position was
     *                  minted.
     * @return The incrmental base and quote debit flows from this action. */
    function recoverKnockout (KnockoutLiq.KnockoutPosLoc memory loc,
                              uint32 pivotTime, bytes32 poolHash)
        internal returns (int128 baseFlow, int128 quoteFlow) {
        uint96 lots = recoverPostKnockout(poolHash, loc, pivotTime);
        uint128 liquidity = lots.lotsToLiquidity();

        (uint128 base, uint128 quote) = liquidityHeldPayable(liquidity, loc);
        (baseFlow, quoteFlow) = signBurnFlow(base, quote);
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
                           int24 lowTick, int24 highTick, bytes32 poolHash,
                           address lpOwner)
        internal returns (int128, int128) {
        uint72 feeMileage = clockFeeOdometer72(poolHash, priceTick, lowTick, highTick,
                                               curve.concGrowth_);
        uint128 rewards = harvestPosLiq(lpOwner, poolHash,
                                        lowTick, highTick, feeMileage);
        withdrawConduit(poolHash, lowTick, highTick, 0, feeMileage, lpOwner);
        accrueConcentratedGlobalTimeWeightedLiquidity(poolHash, curve);
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
        require(swap.isBuy_ ? curve.priceRoot_ <= swap.limitPrice_ : 
                              curve.priceRoot_ >= swap.limitPrice_, "SD");
        
        int24 preTradeTick = curve.priceRoot_.getTickAtSqrtRatio();
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
        int24 postTradeTick = curve.priceRoot_.getTickAtSqrtRatio();
        if (preTradeTick != postTradeTick) {
            crossTicks(pool.hash_, preTradeTick, postTradeTick);
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
        unchecked {
        if (!Bitmaps.isTickFinite(bumpTick)) { return bumpTick; }
        accrueConcentratedGlobalTimeWeightedLiquidity(poolHash, curve);
        bumpLiquidity(curve, bumpTick, swap.isBuy_, poolHash);

        (int128 paidBase, int128 paidQuote, uint128 burnSwap) =
            curve.shaveAtBump(swap.inBaseQty_, swap.isBuy_, swap.qty_);
        accum.accumFlow(paidBase, paidQuote);

        // burn down qty from shaveAtBump is always validated to be less than remaining swap.qty_
        // so this will never underflow
        swap.qty_ -= burnSwap;

        // When selling down, the next tick leg actually occurs *below* the bump tick
        // because the bump barrier is the first price on a tick.
        if (swap.isBuy_) {
            return bumpTick;
        } else {
            return bumpTick - 1; // Valid ticks are well above {min(int128)-1}, so will never underflow
        }
        }
    }

    /* @notice Performs the book-keeping related to crossing a concentrated liquidity 
     *         bump tick, and adjusts the in-memory curve object with the change of
     *         AMM liquidity. */
    function bumpLiquidity (CurveMath.CurveState memory curve,
                            int24 bumpTick, bool isBuy, bytes32 poolHash) private {
        (int128 liqDelta, bool knockoutFlag) =
            crossLevel(poolHash, bumpTick, isBuy, curve.concGrowth_);
        curve.concLiq_ = curve.concLiq_.addDelta(liqDelta);

        if (knockoutFlag) {
            int128 knockoutDelta = callCrossFlag
                (poolHash, bumpTick, isBuy, curve.concGrowth_);
            curve.concLiq_ = curve.concLiq_.addDelta(knockoutDelta);
        }
    }    
}
