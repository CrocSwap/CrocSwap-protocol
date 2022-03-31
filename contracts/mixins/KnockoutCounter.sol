// SPDX-License-Identifier: Unlicensed                                                          
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import '../libraries/LiquidityMath.sol';
import '../libraries/KnockoutLiq.sol';
import './LevelBook.sol';
import './PoolRegistry.sol';
import './AgentMask.sol';

/* @title Knockout Counter
 * @notice Manages the knockout liquidity pivots and positions. Responsible for minting
 *         burning, knocking out, and claiming knockout liquidity, and adjusting bump
 *         points in LevelBook accordingly. *Not* responsible for managing liquidity on 
 *         the curve or debiting/creditiing collateral. Knockout liquidity positions 
 *         should be separately managed from ordinary liquidity, but knockout liquidity 
 *         should be aggregated with AMM/bump point liquidity. */
contract KnockoutCounter is LevelBook, PoolRegistry, AgentMask {
    using SafeCast for uint128;
    using LiquidityMath for uint128;
    using LiquidityMath for uint96;
    using LiquidityMath for uint64;
    using KnockoutLiq for KnockoutLiq.KnockoutMerkle;
    using KnockoutLiq for KnockoutLiq.KnockoutPivot;
    using KnockoutLiq for KnockoutLiq.KnockoutPosLoc;

    /* @notice Emitted at any point a pivot is knocked out. User can use the history
     *         of these logs to reconstructo the Merkle history necessary to claim
     *         their fees. */
    event CrocKnockoutCross (bytes32 indexed pool, int24 indexed tick, bool isBid,
                             uint32 pivotTime, uint64 feeMileage);

    
    /* @notice Called when a given knockout pivot is crossed. Performs the book-keeping
     *         related to reseting the pivot object and committing the Merkle history.
     *         Does *not* adjust the liquidity on the bump point or curve, caller is
     *         responsible for that upstream.
     * 
     * @dev This function must only be called *after* the AMM curve has crossed the
     *      tick and fee odometer on the tick has been updated to reflect the update.
     *
     * @param pool The hash index of the AMM pool.
     * @param isBid If true, indicates that it's a bid pivot being knocked out (i.e.
     *              that price is moving down through the pivot)
     * @param tick The tick index of the knockout pivot.
     * @param feeMileage The in range fee mileage at the point the pivot was crossed. */
    function crossKnockout (bytes32 pool, bool isBid, int24 tick, 
                            uint64 feeGlobal) internal {
        bytes32 lvlKey = KnockoutLiq.encodePivotKey(pool, isBid, tick);
        KnockoutLiq.KnockoutPivot storage pivot = knockoutPivots_[lvlKey];
        KnockoutLiq.KnockoutMerkle storage merkle = knockoutMerkles_[lvlKey];

        unmarkPivot(pool, isBid, tick);
        uint64 feeRange = knockoutRangeLiq(pool, pivot, isBid, tick, feeGlobal);

        merkle.commitKnockout(pivot, feeRange);
        emit CrocKnockoutCross(pool, tick, isBid, merkle.pivotTime_, merkle.feeMileage_);
        
        pivot.deletePivot(); // Nice little SSTORE refund for the swapper
    }

    /* @notice Removes the liquidity at the AMM curve's bump points as part of a pivot
     *         being knocked out by a level cross. */
    function knockoutRangeLiq (bytes32 pool, KnockoutLiq.KnockoutPivot memory pivot,
                               bool isBid, int24 tick, uint64 feeGlobal)
        private returns (uint64 feeRange) {
        int24 offset = int24(uint24(pivot.rangeTicks_));
        int24 priceTick = isBid ? tick-1 : tick;
        int24 lowerTick = isBid ? tick : tick - offset;
        int24 upperTick = !isBid ? tick : tick + offset;
        feeRange = removeBookLiq(pool, priceTick, lowerTick, upperTick,
                                 pivot.lots_, feeGlobal);
    }


    /* @notice Mints a new knockout liquidity position (or adds liquidity to a pre-
     *         existing position.
     *
     * @param pool The cursor for the pool knockout liquidity is being added to.
     * @param curveTick The 24-bit tick index of the current curve price in the pool
     * @param feeGlobal The global cumulative concentrated liquidity fee mileage for
     *                  the curve at mint time.
     * @param loc       The position on the curve the knockout liquidity is being added
     *                  to. (See comments for struct for full explanation of fields)
     * @param posLots    The amount of liquidity lots (in lots of 1024-units of 
     *                   sqrt(X*Y) liquidity) being added to the knockout position. 
     *
     * @return pivotTime  The time tranche of the pivot the liquidity was added to. */
    function mintKnockout (PoolSpecs.PoolCursor memory pool,
                           int24 curveTick, uint64 feeGlobal,
                           KnockoutLiq.KnockoutPosLoc memory loc, uint96 lots)
        internal returns (uint32 pivotTime, bool newPivot) {
        (pivotTime, newPivot) = injectPivot(pool, loc, lots, curveTick);
        uint64 feeRange = addBookLiq(pool.hash_, curveTick, loc.lowerTick_,
                                     loc.upperTick_, lots, feeGlobal);
        if (newPivot) {
            markPivot(pool.hash_, loc);
        }
        insertPosition(pool.hash_, loc, lots, feeRange, pivotTime);
    }

    /* @notice Burns pre-exisitng knockout liquidity, but only if the liqudity is still
     *         alive. (Knocked out positions should use claimKnockout() instead).
     *
     * @param pool The cursor for the pool knockout liquidity is being added to.
     * @param curveTick The 24-bit tick index of the current curve price in the pool
     * @param feeGlobal The global cumulative concentrated liquidity fee mileage for
     *                  the curve at mint time.
     * @param loc       The position on the curve the knockout liquidity is being claimed
     *                  from. (See comments for struct for full explanation of fields)
     *                  to. (See comments for struct for full explanation of fields)
     * @param posLots    The amount of liquidity lots (in lots of 1024-units of 
     *                   sqrt(X*Y) liquidity) being added to the knockout position. 
     *
     * @return pivotTime The tranche time of the underlying pivot the liquidity was 
     *                   removed from.
     * @return rewards  The concentrated liquidity rewards accumulated to the 
     *                  position. */
    function burnKnockout (bytes32 pool, int24 curveTick, uint64 feeGlobal,
                           KnockoutLiq.KnockoutPosLoc memory loc, uint96 lots)
        internal returns (bool killsPivot, uint32 pivotTime, uint64 rewards) {

        (pivotTime, killsPivot) = recallPivot(pool, loc, lots);
        if (killsPivot) { unmarkPivot(pool, loc); }

        uint64 feeRange = removeBookLiq(pool, curveTick, loc.lowerTick_,
                                        loc.upperTick_, lots, feeGlobal);
        rewards = removePosition(pool, loc, lots, feeRange, pivotTime);
    }

    function markPivot (bytes32 pool, KnockoutLiq.KnockoutPosLoc memory loc) private {
        if (loc.isBid_) {
            BookLevel storage lvl = fetchLevel(pool, loc.lowerTick_);
            lvl.bidLots_ = lvl.bidLots_ | uint96(0x1);
        } else {
            BookLevel storage lvl = fetchLevel(pool, loc.upperTick_);
            lvl.askLots_ = lvl.askLots_ | uint96(0x1);
        }
    }

    function unmarkPivot (bytes32 pool, KnockoutLiq.KnockoutPosLoc memory loc) private {
        if (loc.isBid_) {
            unmarkPivot(pool, true, loc.lowerTick_);
        } else {
            unmarkPivot(pool, false, loc.upperTick_);
        }
    }

    function unmarkPivot (bytes32 pool, bool isBid, int24 tick) private {
        BookLevel storage lvl = fetchLevel(pool, tick);
        if (isBid) {
            lvl.bidLots_ = lvl.bidLots_ & ~uint96(0x1);
        } else {
            lvl.askLots_ = lvl.askLots_ & ~uint96(0x1);
        }        
    }

    /* @notice Claims the collateral and rewards for a position that has been fully 
     *         knocked out. (I.e. is no longer active because knockout tick was crossed)
     * 
     * @param pool The cursor for the pool knockout liquidity is being added to.
     * @param loc       The position on the curve the knockout liquidity is being claimed
     *                  from. (See comments for struct for full explanation of fields)
     * @param merkleRoot The root of the Merkle proof to recover the accumulted fees.
     * @param merkleProof The user-supplied proof for the accumulated fees earned by
     *                    the knockout pivot. (Transaction will revert if proof is bad)
     *
     * @return lots    The liquidity (in 1024-unit lots) claimable by the underlying 
     *                 position. Note that this liquidity should be converted to 
     *                 collateral at the knockout price *not* the current curve price).
     * @return reards The in-range concentrated liquidity rewards earned by the position.
     */
    function claimKnockout (bytes32 pool, KnockoutLiq.KnockoutPosLoc memory loc,
                            uint160 merkleRoot, uint96[] calldata merkleProof)
        internal returns (uint96 lots, uint64 rewards) {
        (uint32 pivotTime, uint64 feeSnap) =
            proveKnockout(pool, loc, merkleRoot, merkleProof);
        (lots, rewards) = claimPosition(pool, loc, feeSnap, pivotTime);
    }

    /* @notice Like claimKnockout(), but avoids the need for Merkle proof altogether.
     *         This means the underlying collateral is recoverable, but user renounces
     *         all claims to the accumulated rewards.
     *
     * @dev    This might be used when the calldata cost of the Merkle proof exceeds
     *         the value of the accumulated rewards.
     *
     * @param pool The cursor for the pool knockout liquidity is being added to.
     * @param loc       The position on the curve the knockout liquidity is being claimed
     *                  from. (See comments for struct for full explanation of fields)
     * @param pivotTime The pivot trache the position was minted at. User-supplied value
     *                  must match the position's stored value. Used to verify that the
     *                  tranche is no longer active (otherwise use burnKnockout())
     * @return lots    The liquidity (in 1024-unit lots) claimable by the underlying 
     *                 position. Note that this liquidity should be converted to 
     *                 collateral at the knockout price *not* the current curve price).*/
    function recoverKnockout (bytes32 pool, KnockoutLiq.KnockoutPosLoc memory loc,
                              uint32 pivotTime)
        internal returns (uint96 lots) {
        confirmPivotDead(pool, loc, pivotTime);
        (lots, ) = claimPosition(pool, loc, 0, pivotTime);
    }
    

    /* @notice Inserts the tracking data for the individual position being minted.
     * @param pool The hash of the pool the liquidity applies to.
     * @param loc The context/location data of the knockout liquidity position.
     * @param lots The amount of liquidity minted to the position.
     * @param feeRange The cumulative fee mileage for the concentrated liquidity range
     *                 at current mint time. */
    function insertPosition (bytes32 pool, KnockoutLiq.KnockoutPosLoc memory loc,
                             uint96 lots, uint64 feeRange, uint32 pivotTime) private {
        bytes32 posKey = loc.encodePosKey(pool, agentMintKey(), pivotTime);
        KnockoutLiq.KnockoutPos storage pos = knockoutPos_[posKey];

        uint64 mileage = feeRange.blendMileage(lots, pos.feeMileage_, pos.lots_);
        
        pos.lots_ += lots;
        pos.feeMileage_ = mileage;
        pos.timestamp_ = SafeCast.timeUint32();
    }

    function removePosition (bytes32 pool, KnockoutLiq.KnockoutPosLoc memory loc,
                             uint96 lots, uint64 feeRange, uint32 pivotTime)
        private returns (uint64 feeRewards) {
        bytes32 posKey = loc.encodePosKey(pool, agentBurnKey(), pivotTime);
        KnockoutLiq.KnockoutPos storage pos = knockoutPos_[posKey];

        feeRewards = feeRange - pos.feeMileage_;
        assertJitSafe(pos.timestamp_, pool);
        
        require(pos.lots_ >= lots, "KM");
        if (pos.lots_ == lots) {
            // Get SSTORE refund on full burn
            pos.lots_ = 0;
            pos.feeMileage_ = 0;
            pos.timestamp_ = 0;
        } else {
            pos.lots_ -= lots;
        }
    }

    function claimPosition (bytes32 pool, KnockoutLiq.KnockoutPosLoc memory loc,
                            uint64 feeRange, uint32 pivotTime)
        private returns (uint96 lots, uint64 feeRewards) {
        bytes32 posKey = loc.encodePosKey(pool, agentBurnKey(), pivotTime);
        KnockoutLiq.KnockoutPos storage pos = knockoutPos_[posKey];

        lots = pos.lots_;
        if (feeRange > 0) {
            feeRewards = feeRange - pos.feeMileage_;
        }
        
        // Get SSTORE refund on full burn
        pos.lots_ = 0;
        pos.feeMileage_ = 0;
        pos.timestamp_ = 0;
    }

    /* @notice Creates a new pivot or updates a previous pivot for newly minted knockout
     *         liquidity.
     * @param pool The pool the knockout liquidity applies to.
     * @param loc The context/location of the newly minted knockout liquidity.
     * @param liq The amount of liquidity being minted to the position.
     * @param curveTick The tick index of the current price in the curve.
     * @return bookLiq The amount of liquidity that must be contributed to the range in
     *                 the book. This amount could possibly be different than liq, so 
     *                 it's very important that this value is used to adjust the curve 
     *                 and collect collateral.
     * @return pivotTime The time tranche of the pivot the liquidity is added to. Either
     *                   the current time if liquidity creates a new pivot, or the 
     *                   timestamp of when the previous tranche was created. */
    function injectPivot (PoolSpecs.PoolCursor memory pool,
                          KnockoutLiq.KnockoutPosLoc memory loc,
                          uint96 lots, int24 curveTick) private returns
        (uint32 pivotTime, bool newPivot) {
        bytes32 lvlKey = loc.encodePivotKey(pool.hash_);
        KnockoutLiq.KnockoutPivot storage pivot = knockoutPivots_[lvlKey];
        newPivot = (pivot.lots_ == 0);

        // If mint represents the first position in a new pivot perorm book keeping
        // related to setting the time tranch, warming up the Merkle slot, and verifying
        // that the pivot position is valid relative to the pool's current parameters.
        if (newPivot) {            
            pivotTime = SafeCast.timeUint32();
            freshenMerkle(knockoutMerkles_[lvlKey]);
            loc.assertValidPos(curveTick, pool.head_.knockoutBits_);

            // Should optimize to a single SSTORE call.
            pivot.lots_ = lots;
            pivot.pivotTime_ = pivotTime;
            pivot.rangeTicks_ = loc.tickRange();
            
        } else {
            pivot.lots_ += lots;
            pivotTime = pivot.pivotTime_;
            require(pivot.rangeTicks_ == loc.tickRange(), "KR");
        }
    }

    /* @notice Called to withdraw liquidity from an open knockout pivot. (If pivot was
     *         already knocked out, do not use this function.
     * @param pool The pool the knockout liquidity applies to.
     * @param loc The context/location of the newly minted knockout liquidity.
     * @param liq The amount of liquidity being minted to the position.
     * @return bookLiq The amount of liquidity that shoudl be removed from the book. 
     *                 This amount could possibly be different than liq, so it's very 
     *                 important that this value is used to adjust the AMM curve. 
     * @return pivotTime The tranche timestamp of the current knockout pivot. */
    function recallPivot (bytes32 pool, KnockoutLiq.KnockoutPosLoc memory loc,
                          uint96 lots) private returns
        (uint32 pivotTime, bool killsPivot) {
        bytes32 lvlKey = KnockoutLiq.encodePivotKey(pool, loc.isBid_,
                                                    loc.knockoutTick());
        KnockoutLiq.KnockoutPivot storage pivot = knockoutPivots_[lvlKey];
        pivotTime = pivot.pivotTime_;
        killsPivot = (pivot.lots_ == lots);

        if (killsPivot) {
            // Get the SSTORE refund when completely burning the level
            pivot.lots_ = 0;
            pivot.pivotTime_ = 0;
            pivot.rangeTicks_ = 0;

        } else {
            pivot.lots_ -= lots;
        }
    }

    /* @notice Call on the corresponding Merkle root when creating a new pivot at a 
     *         tick/time tranche. */
    function freshenMerkle (KnockoutLiq.KnockoutMerkle storage merkle) private {
        // Knockout tranches are uniquely identified by block times. There is a
        // rare corner case where multiple knockouts are created, crossed and
        // created again at the same tick all within the same block/time.
        require(merkle.pivotTime_ != SafeCast.timeUint32(), "KT");
            
        // Warm up the slot so that the SSTORE fresh is paid by the LP, not
        // the swapper. This means all Merkle histories begin with a root of 1
        if(merkle.merkleRoot_ == 0) {
            merkle.merkleRoot_ = 1;
        }
    }

    /* @notice Asserts that a given pivot tranche being claimed as knocked out, was
     *         in fact knocked out. Used when the user doesn't have or doesn't want to
     *         present a Merkle proof.
     *
     * @dev    Relies on two guarantees. 1) base Merkle time is always increasing, 
     *         because pivots are created, and therefore knocked out, in monotonically
     *         increasing time order. 2) Tranches will never be created at the same time-
     *         stamp as the most recent Merkle commitment. Therefore a pivot tranche
     *         has been knocked out if and only if the most recent Merkle commitment has
     *         an equal of greater timestamp. */
    function confirmPivotDead (bytes32 pool, KnockoutLiq.KnockoutPosLoc memory loc,
                               uint32 pivotTime)
        private view {
        bytes32 lvlKey = KnockoutLiq.encodePivotKey(pool, loc.isBid_,
                                                    loc.knockoutTick());
        KnockoutLiq.KnockoutMerkle storage merkle = knockoutMerkles_[lvlKey];
        require(merkle.pivotTime_ >= pivotTime, "KA");
    }

    /* @notice Verifies the user-supplied Merkle proof. (See proveHistory() in 
     *         KnockoutLiq library). If proof is wrong, transaction will revert.
     *
     * @return pivotTime The pivot time from the verified proof. Caller is responsible
     *                   for making sure this matches the pivotTime in the position
     *                   being claimed.
     * @return feeSnap The in-range fee mileage at Merkle commitment time, i.e. when the
     *                 pivot was knocked out. */
    function proveKnockout (bytes32 pool, KnockoutLiq.KnockoutPosLoc memory loc,
                            uint160 root, uint96[] calldata proof)
        private view returns (uint32 pivotTime, uint64 feeSnap) {
        bytes32 lvlKey = KnockoutLiq.encodePivotKey(pool, loc.isBid_,
                                                    loc.knockoutTick());
        KnockoutLiq.KnockoutMerkle storage merkle = knockoutMerkles_[lvlKey];
        (pivotTime, feeSnap) = merkle.proveHistory(root, proof);
    }
}

