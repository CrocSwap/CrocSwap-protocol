// SPDX-License-Identifier: GPL-3                                         
pragma solidity 0.8.19;

import '../libraries/BitMath.sol';
import '../libraries/Bitmaps.sol';
import '../libraries/TickMath.sol';
import './StorageLayout.sol';

/* @title Tick census mixin.
 * @notice Tracks which tick indices have an active liquidity bump, making it gas
 *   efficient for random read and writes, and to find the next bump tick boundary
 *   on the curve. */
contract TickCensus is StorageLayout {
    using Bitmaps for uint256;
    using Bitmaps for int24;

    /* Tick positions are stored in three layers of 8-bit/256-slot bitmaps. Recursively
     * they indicate whether any given 24-bit tick index is active.

     * The first layer (lobby) represents the 8-bit tick root. If we did store this
     * layer, we'd only need a single 256-bit bitmap per pool. However we do *not*
     * store this layer, because it adds an unnecessary SLOAD/SSTORE operation on
     * almost all operations. Instead users can query this layer by checking whether
     * mezzanine key is set for each bit. The tradeoff is that lobby bitmap queries
     * are no longer O(1) random access but O(N) seeks. However at most there are 256
     * SLOAD on a lobby-layer seek, and spills at the lobby layer are rare (moving 
     * between multiple lobby bits requires a 65,000% price change). This gas tradeoff
     *  is virtually always justified. 
     *
     * The second layer (mezzanine) maps whether each 16-bit tick root is set. An 
     * entry will be set if and only if *any* tick index in the 8-bit range is set. 
     * Because there are 256^2 slots, this is represented as a map from the first 8-
     * bits in the root to individual 8-bit/256-slot bitmaps for the middle 8-bits 
     * at that root. 
     *
     * The final layer (terminus) directly maps whether individual tick indices are
     * set. Because there are 256^3 possible slots, this is represnted as a mapping 
     * from the first 16-bit tick root to individual 8-bit/256-slot bitmaps of the 
     * terminal 8-bits within that root. */

    /* @notice Returns the associated bitmap for the terminus position (bottom layer) 
     *         of the tick index. 
     * @param poolIdx The hash key associated with the pool being queried.
     * @param tick A price tick index within the neighborhood that we want the bitmap for.
     * @return The bitmap of the 256-tick neighborhood. */
    function terminusBitmap (bytes32 poolIdx, int24 tick)
        internal view returns (uint256) {
        bytes32 idx = encodeTerm(poolIdx, tick);
        return terminus_[idx];
    }
    
    /* @notice Returns the associated bitmap for the mezzanine position (middle layer) 
     *         of the tick index.
     * @param poolIdx The hash key associated with the pool being queried.
     * @param tick A price tick index within the neighborhood that we want the bitmap for.
     * @return The mezzanine bitmap of the 65536-tick neighborhood. */
    function mezzanineBitmap (bytes32 poolIdx, int24 tick)
        internal view returns (uint256) {
        bytes32 idx = encodeMezz(poolIdx, tick);
        return mezzanine_[idx];
    }

    /* @notice Returns true if the tick index is currently set. Indicates an tick exists
     *         at that index. 
     * @param poolIdx The hash key associated with the pool being queried.
     * @param tick The price tick that we're querying. */
    function hasTickBookmark (bytes32 poolIdx, int24 tick)
        internal view returns (bool) {
        uint256 bitmap = terminusBitmap(poolIdx, tick);
        uint8 term = tick.termBit();
        return bitmap.isBitSet(term);
    }

    /* @notice Mark the tick index as active.
     * @dev Idempotent. Can be called repeatedly on previously initialized ticks.
     * @param poolIdx The hash key associated with the pool being queried.
     * @param tick The price tick that we're marking as enabled. */
    function bookmarkTick (bytes32 poolIdx, int24 tick)
        internal {
        uint256 mezzMask = 1 << tick.mezzBit();
        uint256 termMask = 1 << tick.termBit();
        mezzanine_[encodeMezz(poolIdx, tick)] |= mezzMask;
        terminus_[encodeTerm(poolIdx, tick)] |= termMask;
    }

    /* @notice Unset the tick index as no longer active. Take care of any book keeping
     *   related to the recursive bitmap levels.
     * @dev Idempontent. Can be called repeatedly even if tick was previously 
     *   forgotten.
     * @param poolIdx The hash key associated with the pool being queried.
     * @param tick The price tick that we're marking as disabled. */
    function forgetTick (bytes32 poolIdx, int24 tick) internal {
        uint256 mezzMask = ~(1 << tick.mezzBit());
        uint256 termMask = ~(1 << tick.termBit());

        bytes32 termIdx = encodeTerm(poolIdx, tick);
        uint256 termUpdate = terminus_[termIdx] & termMask;
        terminus_[termIdx] = termUpdate;
        
        if (termUpdate == 0) {
            bytes32 mezzIdx = encodeMezz(poolIdx, tick);
            uint256 mezzUpdate = mezzanine_[mezzIdx] & mezzMask;
            mezzanine_[mezzIdx] = mezzUpdate;
        }
    }

    /* @notice Finds an inner-bound conservative liquidity tick boundary based on
     *   the terminus map at a starting tick point. Because liquidity actually bumps
     *   at the bottom of the tick, the result is assymetric on direction. When seeking
     *   an upper barrier, it'll be the tick that we cross into. For lower barriers, it's
     *   the tick that we cross out of, and therefore could even be the starting tick.
     * 
     * @dev For gas efficiency this method only looks at a previously loaded terminus
     *   bitmap. Often for moves of that size we don't even need to look past the 
     *   terminus boundary. So there's no point doing a mezzanine layer seek unless we
     *   end up needing it.
     *
     * @param poolIdx The hash key associated with the pool being queried.
     * @param isUpper - If true indicates that we're looking for an upper boundary.
     * @param startTick - The current tick index that we're finding the boundary from.
     *
     * @return boundTick - The tick index that we can conservatively move to without 
     *    potentially hitting any currently active liquidity bump points.
     * @return isSpill - If true indicates that the boundary represents the end of the
     *    inner terminus bitmap neighborhood. Based on this we have to actually check whether
     *     we've reached teh true end of the liquidity range, or just the end of the known
     *     neighborhood.  */
    function pinBitmap (bytes32 poolIdx,
                        bool isUpper, int24 startTick)
        internal view returns (int24 boundTick, bool isSpill) {
        uint256 termBitmap = terminusBitmap(poolIdx, startTick);
        uint16 shiftTerm = startTick.termBump(isUpper);
        int16 tickMezz = startTick.mezzKey();
        (boundTick, isSpill) = pinTermMezz
            (isUpper, shiftTerm, tickMezz, termBitmap);
    }

    /* @notice Formats the tick bit horizon index and sets the flag for whether it
    *          represents whether the seeks spills over the terminus neighborhood */
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

    /* @notice Returns true if the tick seek reaches the end of the inner terminus 
     *      bitmap neighborhood. If that happens, it's like reaching the end of the map.
     *      It's returned as the boundary point, but the the user must be aware that the tick
     *      may or may not represent an active liquidity tick and check accordingly. */
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

    /* @notice Formats the censored horizon tick index when the seek has spilled out of 
     *         the terminus bitmap neighborhood. */
    function spillOverPin (bool isUpper, int16 tickMezz) private pure returns (int24) {
        if (isUpper) {
            return tickMezz == Bitmaps.zeroMezz(isUpper) ?
                Bitmaps.zeroTick(isUpper) :
                Bitmaps.weldMezzTerm(tickMezz + 1, Bitmaps.zeroTerm(!isUpper));
        } else {
            return Bitmaps.weldMezzTerm(tickMezz, 0);
        }
    }


    /* @notice Determines the next tick bump boundary tick starting using recursive
     *   bitmap lookup. Follows the same up/down assymetry as pinBitmap(). Upper bump
     *   is the tick being crossed *into*, lower bump is the tick being crossed *out of*
     *
     * @dev This is a much more gas heavy operation because it recursively looks 
     *   though all three layers of bitmaps. It should only be called if pinBitmap()
     *   can't find the boundary in the terminus layer.
     *
     * @param poolIdx The hash key associated with the pool being queried.
     * @param borderTick - The current tick that we want to seek a tick liquidity
     *   boundary from. For defined behavior this tick must occur at the border of
     *   terminus bitmap. For lower borders, must be the tick from the start of the byte.
     *   For upper borders, must be the tick past the end of the byte. Any spill result 
     *   from pinTermMezz() is safe.
     * @param isUpper - The direction of the boundary. If true seek an upper boundary.
     *
     * @return (int24) - The tick index of the next tick boundary with an active 
     *   liquidity bump. The result is assymetric boundary for upper/lower ticks. */
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
        uint256 neighborBitmap = terminus_
            [encodeTermWord(poolIdx, lobbyBit, mezzBit)];
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
        uint256 neighborMezz = mezzanine_
            [encodeMezzWord(poolIdx, lobbyBit)];
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
            // Unchecked because we want idx to wrap around to 0, to check all 256 bits
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
            // Unchecked because we want idx to wrap around to 255, to check all 256 bits
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
}

