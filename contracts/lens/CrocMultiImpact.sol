// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;
import "../CrocSwapDex.sol";

/* @notice Stateless read only contract that calculates the price impact of a series of
 *         hypothetical swaps on the current state of a given CrocSwapDex pool. Useful for
 *         calculating impact of multihop swaps without actually executing them, or needing
 *         the underlying tokens.
 *
 * @dev Nothing in this contract can't be done by directly accessing readSlot() on the
 *      CrocSwapDex contract. However this provides a more convenient interface with ergonomic
 *      that parse the raw data. */
contract CrocMultiImpact {
    using CurveMath for CurveMath.CurveState;
    using CurveRoll for CurveMath.CurveState;
    using SwapCurve for CurveMath.CurveState;
    using SafeCast for uint144;
    using TickMath for uint128;
    using LiquidityMath for uint128;
    using Chaining for Chaining.PairFlow;
    using Bitmaps for uint256;
    using Bitmaps for int24;

    address immutable public dex_;

    /* @param dex The address of the CrocSwapDex contract. */
    constructor (address dex) {
        require(dex != address(0) && CrocSwapDex(dex).acceptCrocDex(), "Invalid CrocSwapDex");
        dex_ = dex;
    }

    /* @notice Calculates the impact of a hypothetical swap.
     *
     * @param base The base token address of the pair
     * @param quote The quote token address of the pair
     * @param poolIdx The pool index
     * @param isBuy True if the swap is paying base side tokens and receiving quote side
     *              tokens.
     * @param inBaseQty True if the fixed quantity side of the swap is base tokens, false
     *                  quote side tokens.
     * @param qty The total fixed number of tokens being paid or received in the swap.
     * @param curve The current state of the liquidity curve.
     *
     * @return baseFlow The base side tokens transacted in the swap.
     * @return quoteFlow The base side tokens transacted in the swap.
     * @return curve The updated state of the liquidity curve. */
    function calcImpact (address base, address quote,
                        uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty,
                        CurveMath.CurveState memory curve) private view
        returns (int128 baseFlow, int128 quoteFlow, CurveMath.CurveState memory) {

        PoolSpecs.PoolCursor memory pool = queryPoolCntx
            (base, quote, poolIdx, 0);

        Directives.SwapDirective memory dir;
        dir.isBuy_ = isBuy;
        dir.inBaseQty_ = inBaseQty;
        dir.qty_ = qty;
        dir.limitPrice_ = isBuy ? 21267430153580247136652501917186561137 : 65538;

        (baseFlow, quoteFlow) = sweepSwap(pool, curve, dir);
        return (baseFlow, quoteFlow, curve);
    }

    /* @notice Defines a single step of a multihop swap path.
     *
     * @param token The address of destination token of the swap.
     * @param poolIdx The pool to use with the previous token (or next token if isFixedOutput). */
    struct SwapHop {
        address token;
        uint256 poolIdx;
    }

    /* @notice Calculates the impact of a series of hypothetical swaps.
     *
     * @param hops Swap path that includes the input token, all the intermediary tokens, and
     *             the output token. The input is always first, regardless of isFixedOutput.
     * @param qty The total fixed number of tokens being paid or received in the swap.
     * @param isFixedOutput True if qty is the fixed amount of output tokens, false otherwise.
     *
     * @return inputFlow The input side tokens transacted in the swap.
     * @return outputFlow The output side tokens transacted in the swap. */
    function calcMultiHopImpact (SwapHop[] memory hops, uint128 qty, bool isFixedOutput) public view
        returns (int128 inputFlow, int128 outputFlow) {
        PoolCurve[] memory curves = new PoolCurve[](hops.length - 1);
        return calcMultiHopImpact_(hops, qty, isFixedOutput, curves);
    }

    function calcMultiHopImpact_ (SwapHop[] memory hops, uint128 qty, bool isFixedOutput, PoolCurve[] memory curves) private view
        returns (int128 inputFlow, int128 outputFlow) {

        uint256 hopIdx = isFixedOutput ? hops.length - 1 : 0;
        address prevToken = hops[hopIdx].token;
        uint128 nextQty = qty;
        while (isFixedOutput ? hopIdx > 0 : hopIdx < hops.length - 1) {
            SwapHop memory nextHop = hops[uint256(int256(hopIdx) + (isFixedOutput ? int256(-1) : int256(1)))];

            SwapHopDirective memory dir;
            dir.fromToken = prevToken;
            dir.toToken = nextHop.token;
            dir.poolIdx = nextHop.poolIdx;
            dir.qty = nextQty;
            dir.isFixedOutput = isFixedOutput;

            (int128 baseFlow, int128 quoteFlow) = calcOneHopImpact(dir, curves);

            // Invalid flows should terminate calculation
            require((baseFlow >= 0) != (quoteFlow >= 0), "IL");

            if (hopIdx - (isFixedOutput ? 1 : 0) == 0) {
                inputFlow = hops[0].token < hops[1].token ? baseFlow : quoteFlow;
            }
            if (hopIdx + (isFixedOutput ? 0 : 1) == hops.length - 1) {
                outputFlow = hops[hops.length - 2].token < hops[hops.length - 1].token ? quoteFlow : baseFlow;
            }
            hopIdx = isFixedOutput ? hopIdx - 1 : hopIdx + 1;
            nextQty = prevToken < nextHop.token ? uint128(quoteFlow) : uint128(baseFlow);
            nextQty = isFixedOutput ? nextQty : uint128(-int128(nextQty));
            prevToken = nextHop.token;
        }

        require(isFixedOutput ? uint128(-outputFlow) == qty : uint128(inputFlow) == qty, "IQ");
    }

    struct SwapHopDirective {
        address fromToken;
        address toToken;
        uint256 poolIdx;
        uint128 qty;
        bool isFixedOutput;
    }

    struct PoolCurve {
        address base;
        address quote;
        uint256 poolIdx;
        CurveMath.CurveState curve;
    }

    function calcOneHopImpact (SwapHopDirective memory dir, PoolCurve[] memory curves) private view
        returns (int128 baseFlow, int128 quoteFlow) {

        address base = dir.fromToken < dir.toToken ? dir.fromToken : dir.toToken;
        address quote = dir.fromToken < dir.toToken ? dir.toToken : dir.fromToken;

        // Try to find the curve if there's already been a swap in the same pool
        int256 curveIndex = -1;
        {
            uint256 firstEmptyIdx = 0;
            for (uint256 i = 0; i < curves.length; i++) {
                if (curves[i].poolIdx != 0) {
                    firstEmptyIdx = i + 1;
                } else {
                    break;
                }
                if (curves[i].base == base && curves[i].quote == quote && curves[i].poolIdx == dir.poolIdx) {
                    curveIndex = int256(i);
                    break;
                }
            }
            if (curveIndex == -1) {
                curveIndex = int256(firstEmptyIdx);
                curves[uint256(curveIndex)] = PoolCurve(base, quote, dir.poolIdx, queryCurve(base, quote, dir.poolIdx));
            }
        }

        CurveMath.CurveState memory curve;
        bool isBuy = dir.isFixedOutput ? (dir.fromToken == quote) : (dir.fromToken == base);
        bool inBaseQty = dir.isFixedOutput ? (dir.fromToken == base) : (dir.fromToken == base);

        (baseFlow, quoteFlow, curve) = calcImpact
                (base, quote, dir.poolIdx, isBuy, inBaseQty,
                dir.qty, curves[uint256(curveIndex)].curve);

        curves[uint256(curveIndex)].curve = curve;
    }

    /* @notice Defines a part of a complex multihop swap order with multiple inputs and/or outputs.
     *
     * @param hops Swap path that includes the input token, all the intermediary tokens, and
     *             the output token. The input is always first, regardless of isFixedOutput.
     * @param qty The total fixed number of tokens being paid or received in the swap.
     * @param isFixedOutput True if qty is the fixed amount of output tokens, false otherwise. */
    struct SwapPath {
        SwapHop[] hops;
        uint128 qty;
        bool isFixedOutput;
    }

    struct SwapPathOutput {
        int128 inputFlow;
        int128 outputFlow;
    }

    /* @notice Calculates the impact of a series of hypothetical parallel swaps. Multiple swaps in
     *         the same pool are allowed.
     *
     * @param paths Swap paths that include the input token, all the intermediary tokens, and
     *              the output token.
     *
     * @return outputs The input and output sides of tokens transacted in each swap path. */
    function calcMultiPathImpact (SwapPath[] memory paths) public view
        returns (SwapPathOutput[] memory) {
        SwapPathOutput[] memory outputs = new SwapPathOutput[](paths.length);

        // Calculate upper bound of the number of pools involved in the swaps
        uint256 poolCount = 0;
        for (uint256 i = 0; i < paths.length; i++) {
            poolCount += paths[i].hops.length - 1;
        }
        PoolCurve[] memory curves = new PoolCurve[](poolCount);

        for (uint256 i = 0; i < paths.length; i++) {
            (int128 inputFlow, int128 outputFlow) = calcMultiHopImpact_(paths[i].hops, paths[i].qty, paths[i].isFixedOutput, curves);
            outputs[i] = SwapPathOutput(inputFlow, outputFlow);
        }
        return outputs;
    }

    /* @notice Retrieves the pool context object. */
    function queryPoolCntx (address base, address quote,
                            uint256 poolIdx, uint16 poolTip) private view
        returns (PoolSpecs.PoolCursor memory cursor) {
        uint256 POOL_SLOT = 65545;

        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 slot = keccak256(abi.encodePacked(poolHash, POOL_SLOT));
        uint256 val = CrocSwapDex(dex_).readSlot(uint256(slot));

        cursor.hash_ = poolHash;
        cursor.head_.feeRate_ = uint16((val & uint256(0xFFFF00)) >> 8);
        cursor.head_.protocolTake_ = uint8((val & uint256(0xFF000000)) >> 24);

        if (poolTip > cursor.head_.feeRate_) {
            cursor.head_.feeRate_ = poolTip;
        }
    }

    /* @notice Retrieves the liquidity curve state for the pool. */
    function queryCurve (address base, address quote, uint256 poolIdx) private view
        returns (CurveMath.CurveState memory curve) {
        bytes32 key = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.CURVE_MAP_SLOT));
        uint256 valOne = CrocSwapDex(dex_).readSlot(uint256(slot));
        uint256 valTwo = CrocSwapDex(dex_).readSlot(uint256(slot)+1);

        curve.priceRoot_ = uint128((valOne << 128) >> 128);
        curve.ambientSeeds_ = uint128(valOne >> 128);
        curve.concLiq_ = uint128((valTwo << 128) >> 128);
        curve.seedDeflator_ = uint64((valTwo << 64) >> 192);
        curve.concGrowth_ = uint64(valTwo >> 192);
    }

    /* @notice Retrieves the level liquidity state for the tick in the pool. */
    function queryLevel (bytes32 poolHash, int24 tick) private view
        returns (uint96 bidLots, uint96 askLots) {
        bytes32 key = keccak256(abi.encodePacked(poolHash, tick));
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.LVL_MAP_SLOT));
        uint256 val = CrocSwapDex(dex_).readSlot(uint256(slot));

        askLots = uint96((val << 64) >> 160);
        bidLots = uint96((val << 160) >> 160);
    }

    /* @notice Retrieves the terminus level bitmap at the location. */
    function queryTerminus (bytes32 key) private view returns (uint256) {
        uint256 TERMINUS_SLOT = 65543;
        bytes32 slot = keccak256(abi.encode(key, TERMINUS_SLOT));
        return CrocSwapDex(dex_).readSlot(uint256(slot));
    }

    /* @notice Retrieves the mezzanine level bitmap at the location. */
    function queryMezz (bytes32 key) private view returns (uint256) {
        uint256 MEZZ_SLOT = 65542;
        bytes32 slot = keccak256(abi.encode(key, MEZZ_SLOT));
        return CrocSwapDex(dex_).readSlot(uint256(slot));

    }

    /* @notice Calculates the swap flow and applies the change to the liquidity curve
     *         object */
    function sweepSwap (PoolSpecs.PoolCursor memory pool,
                        CurveMath.CurveState memory curve,
                        Directives.SwapDirective memory swap) private view
        returns (int128 baseFlow, int128 quoteFlow) {

        if (swap.isBuy_ == (curve.priceRoot_ >= swap.limitPrice_)) {
            return (0, 0);
        }

        Chaining.PairFlow memory accum;
        int24 midTick = curve.priceRoot_.getTickAtSqrtRatio();

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
                    midTick = adjTickLiq(accum, bumpTick, curve, swap, pool.hash_);
                }
            }

        }
        return (accum.baseFlow_, accum.quoteFlow_);
    }

    /* @notice Adjusts the liquidity when crossing over a concentrated liquidity bump at
     *         a given tick. */
    function adjTickLiq (Chaining.PairFlow memory accum, int24 bumpTick,
                         CurveMath.CurveState memory curve,
                         Directives.SwapDirective memory swap,
                         bytes32 poolHash) private view returns (int24) {
        unchecked {
        if (!Bitmaps.isTickFinite(bumpTick)) { return bumpTick; }

        (uint96 bidLots, uint96 askLots) = queryLevel(poolHash, bumpTick);
        int128 crossDelta = LiquidityMath.netLotsOnLiquidity(bidLots, askLots);
        int128 liqDelta = swap.isBuy_ ? crossDelta : -crossDelta;
        curve.concLiq_ = curve.concLiq_.addDelta(liqDelta);

        (int128 paidBase, int128 paidQuote, uint128 burnSwap) =
            curve.shaveAtBump(swap.inBaseQty_, swap.isBuy_, swap.qty_);
        accum.accumFlow(paidBase, paidQuote);
        swap.qty_ -= burnSwap;

        // When selling down, the next tick leg actually occurs *below* the bump tick
        // because the bump barrier is the first price on a tick.
        return swap.isBuy_ ?
            bumpTick :
            bumpTick - 1; // Valid ticks are well above {min(int128)-1}
        }
    }

    /* @notice Calculates the next tick to seek in the curve bump tick map. */
    function pinBitmap (bytes32 poolHash, bool isUpper, int24 startTick)
        private view returns (int24 boundTick, bool isSpill) {
        uint256 termBitmap = queryTerminus(encodeTerm(poolHash, startTick));
        uint16 shiftTerm = startTick.termBump(isUpper);
        int16 tickMezz = startTick.mezzKey();
        (boundTick, isSpill) = pinTermMezz
            (isUpper, shiftTerm, tickMezz, termBitmap);
    }

    /* @notice Calculates the next mezzanine tick to seek in the curve bump tick map. */
    function pinTermMezz (bool isUpper, uint16 shiftTerm, int16 tickMezz,
                          uint256 termBitmap)
        private pure returns (int24 nextTick, bool spillBit) {
        (uint8 nextTerm, bool spillTrunc) =
            termBitmap.bitAfterTrunc(shiftTerm, isUpper);
        spillBit = doesSpillBit(isUpper, spillTrunc, termBitmap);
        nextTick = spillBit ?
            spillOverPin(isUpper, tickMezz) :
            Bitmaps.weldMezzTerm(tickMezz, nextTerm);
    }

    /* @notice Moves to next tick when reaching the end of a terminus in bitmap */
    function spillOverPin (bool isUpper, int16 tickMezz) private pure returns (int24) {
        if (isUpper) {
            return tickMezz == Bitmaps.zeroMezz(isUpper) ?
                Bitmaps.zeroTick(isUpper) :
                Bitmaps.weldMezzTerm(tickMezz + 1, Bitmaps.zeroTerm(!isUpper));
        } else {
            return Bitmaps.weldMezzTerm(tickMezz, 0);
        }
    }

    /* @notice Determines if the seek would spill over the outside of the bitmap terminus. */
    function doesSpillBit (bool isUpper, bool spillTrunc, uint256 termBitmap)
        private pure returns (bool spillBit) {
        if (isUpper) {
            spillBit = spillTrunc;
        } else {
            bool bumpAtFloor = termBitmap.isBitSet(0);
            spillBit = bumpAtFloor ? false :
                spillTrunc;
        }
    }

    /* @notice Seeks the next liquidity bump in tick bitmap at the mezzanine level. */
    function seekMezzSpill (bytes32 poolIdx, int24 borderTick, bool isUpper)
        internal view returns (int24) {
        (uint8 lobbyBorder, uint8 mezzBorder) = rootsForBorder(borderTick, isUpper);

        // Most common case is that the next neighboring bitmap on the border has
        // an active tick. So first check here to save gas in the hotpath.
        (int24 pin, bool spills) =
            seekAtTerm(poolIdx, lobbyBorder, mezzBorder, isUpper);
        if (!spills) { return pin; }

        // Next check to see if we can find a neighbor in the mezzanine. This almost
        // always happens except for very sparse pools.
        (pin, spills) =
            seekAtMezz(poolIdx, lobbyBorder, mezzBorder, isUpper);
        if (!spills) { return pin; }

        // Finally iterate through the lobby layer.
        return seekOverLobby(poolIdx, lobbyBorder, isUpper);
    }

    /* @notice Seeks the next tick bitmap by searching in the adjacent neighborhood. */
    function seekAtTerm (bytes32 poolIdx, uint8 lobbyBit, uint8 mezzBit, bool isUpper)
        private view returns (int24, bool) {
        uint256 neighborBitmap = queryTerminus(encodeTermWord(poolIdx, lobbyBit, mezzBit));
        (uint8 termBit, bool spills) = neighborBitmap.bitAfterTrunc(0, isUpper);
        if (spills) { return (0, true); }
        return (Bitmaps.weldLobbyPosMezzTerm(lobbyBit, mezzBit, termBit), false);
    }

    /* @notice Seeks the next tick bitmap by searching in the current mezzanine
     *         neighborhood.
     * @dev This covers a span of 65 thousand ticks, so should capture most cases. */
    function seekAtMezz (bytes32 poolIdx, uint8 lobbyBit,
                         uint8 mezzBorder, bool isUpper)
        private view returns (int24, bool) {
        uint256 neighborMezz = queryMezz(encodeMezzWord(poolIdx, lobbyBit));
        uint8 mezzShift = Bitmaps.bitRelate(mezzBorder, isUpper);
        (uint8 mezzBit, bool spills) = neighborMezz.bitAfterTrunc(mezzShift, isUpper);
        if (spills) { return (0, true); }
        return seekAtTerm(poolIdx, lobbyBit, mezzBit, isUpper);
    }

    /* @notice Used when the tick is not contained in the mezzanine. We walk through the
     *         the mezzanine tick bitmaps one by one until we find an active tick bit. */
    function seekOverLobby (bytes32 poolIdx, uint8 lobbyBit, bool isUpper)
        private view returns (int24) {
        return isUpper ?
            seekLobbyUp(poolIdx, lobbyBit) :
            seekLobbyDown(poolIdx, lobbyBit);
    }

    /* Unlike the terminus and mezzanine layer, we don't store a bitmap at the lobby
     * layer. Instead we iterate through the top-level bits until we find an active
     * mezzanine. This requires a maximum of 256 iterations, and can be gas intensive.
     * However moves at this level represent 65,000% price changes and are very rare. */
    function seekLobbyUp (bytes32 poolIdx, uint8 lobbyBit)
        private view returns (int24) {
        uint8 MAX_MEZZ = 0;
        unchecked {
            // Because it's unchecked idx will wrap around to 0 when it checks all bits
            for (uint8 i = lobbyBit + 1; i > 0; ++i) {
                (int24 tick, bool spills) = seekAtMezz(poolIdx, i, MAX_MEZZ, true);
                if (!spills) { return tick; }
            }
        }
        return Bitmaps.zeroTick(true);
    }

    /* Same logic as seekLobbyUp(), but the inverse direction. */
    function seekLobbyDown (bytes32 poolIdx, uint8 lobbyBit)
        private view returns (int24) {
        uint8 MIN_MEZZ = 255;
        unchecked {
            // Because it's unchecked idx will wrap around to 255 when it checks all bits
            for (uint8 i = lobbyBit - 1; i < 255; --i) {
                (int24 tick, bool spills) = seekAtMezz(poolIdx, i, MIN_MEZZ, false);
                if (!spills) { return tick; }
            }
        }
        return Bitmaps.zeroTick(false);
    }

    /* @notice Splits out the lobby bits and the mezzanine bits from the 24-bit price
     *         tick index associated with the type of border tick used in seekMezzSpill()
     *         call */
    function rootsForBorder (int24 borderTick, bool isUpper) private pure
        returns (uint8 lobbyBit, uint8 mezzBit) {
        // Because pinTermMezz returns a border *on* the previous bitmap, we need to
        // decrement by one to get the seek starting point.
        int24 pinTick = isUpper ? borderTick : (borderTick - 1);
        lobbyBit = pinTick.lobbyBit();
        mezzBit = pinTick.mezzBit();
    }

    /* @notice Encodes the hash key for the mezzanine neighborhood of the tick. */
    function encodeMezz (bytes32 poolIdx, int24 tick) private pure returns (bytes32) {
        int8 wordPos = tick.lobbyKey();
        return keccak256(abi.encodePacked(poolIdx, wordPos));
    }

    /* @notice Encodes the hash key for the terminus neighborhood of the tick. */
    function encodeTerm (bytes32 poolIdx, int24 tick) private pure returns (bytes32) {
        int16 wordPos = tick.mezzKey();
        return keccak256(abi.encodePacked(poolIdx, wordPos));
    }

    /* @notice Encodes the hash key for the mezzanine neighborhood of the first 8-bits
     *         of a tick index. (This is all that's needed to determine mezzanine.) */
    function encodeMezzWord (bytes32 poolIdx, int8 lobbyPos)
        private pure returns (bytes32) {
        return keccak256(abi.encodePacked(poolIdx, lobbyPos));
    }

    /* @notice Encodes the hash key for the mezzanine neighborhood of the first 8-bits
     *         of a tick index. (This is all that's needed to determine mezzanine.) */
    function encodeMezzWord (bytes32 poolIdx, uint8 lobbyPos)
        private pure returns (bytes32) {
        return encodeMezzWord(poolIdx, Bitmaps.uncastBitmapIndex(lobbyPos));
    }

    /* @notice Encodes the hash key for the terminus neighborhood of the first 16-bits
     *         of a tick index. (This is all that's needed to determine terminus.) */
    function encodeTermWord (bytes32 poolIdx, uint8 lobbyPos, uint8 mezzPos)
        private pure returns (bytes32) {
        int16 mezzIdx = Bitmaps.weldLobbyMezz
            (Bitmaps.uncastBitmapIndex(lobbyPos), mezzPos);
        return keccak256(abi.encodePacked(poolIdx, mezzIdx));
    }

    /* @notice If true, indicates there is still more quantity to execute in the swap. */
    function hasSwapLeft (CurveMath.CurveState memory curve,
                          Directives.SwapDirective memory swap)
        private pure returns (bool) {
        bool inLimit = swap.isBuy_ ?
            curve.priceRoot_ < swap.limitPrice_ :
            curve.priceRoot_ > swap.limitPrice_;
        return inLimit && (swap.qty_ > 0);
    }
}
