// SPDX-License-Identifier: Unlicensed                                         
pragma solidity >=0.8.4;

import '../libraries/BitMath.sol';
import '../libraries/Bitmaps.sol';
import '../libraries/TickMath.sol';

import "hardhat/console.sol";

/* @title Tick census library.
 * @notice Tracks which tick indices have an active liquidity bump, making it gas
 *   efficient for random read and writes, and to find the next bump tick boundary
 *   on the curve. */
library TickCensusLib {
    using Bitmaps for uint256;
    using Bitmaps for int24;

    /* Tick positions are stored in three layers of 8-bit/256-slot bitmaps. Recursively
     * they indicate whether any given 24-bit tick index is active.  */
    struct TickCensus {
        /* The second layer (mezzanine) maps whether each 16-bit tick root is set. An 
         * entry will be set if and only if *any* tick index in the 8-bit range is set. 
         * Because there are 256^2 slots, this is represented as map from the first 8-
         * bits in the root to individual 8-bit/256-slot bitmaps for the middle 8-bits 
         * at that root. */
        mapping(bytes32 => uint256) mezzanine_;
        
        /* The final layer (terminus) directly maps whether individual tick indices are
         * set. Because there are 256^3 possible slots, this is represnted as a mapping 
         * from the first 16-bit tick root to individual 8-bit/256-slot bitmaps of the 
         * terminal 8-bits within that root. */
        mapping(bytes32 => uint256) terminus_;
    }

    /* @notice Returns the associated bitmap for the terminus position (bottom layer) 
     * of the tick index. */
    function terminusBitmap (TickCensus storage census, uint16 poolIdx, int24 tick)
        internal view returns (uint256) {
        bytes32 idx = encodeTerm(poolIdx, tick);
        return census.terminus_[idx];
    }
    
    /* @notice Returns the associated bitmap for the mezzanine position (middle layer) 
     * of the tick index. */
    function mezzanineBitmap (TickCensus storage census, uint16 poolIdx, int24 tick)
        internal view returns (uint256) {
        bytes32 idx = encodeMezz(poolIdx, tick);
        return census.mezzanine_[idx];
    }

    /* @notice Returns true if the tick index is currently set. */
    function hasTickBookmark (TickCensus storage census, uint16 poolIdx, int24 tick)
        internal view returns (bool) {
        uint256 bitmap = terminusBitmap(census, poolIdx, tick);
        uint8 term = tick.termBit();
        return bitmap.isBitSet(term);
    }

    /* @notice Mark the tick index as active.
     * @dev Idempotent. Can be called repeatedly on previously initialized ticks. */
    function bookmarkTick (TickCensus storage census, uint16 poolIdx, int24 tick)
        internal {
        uint256 mezzMask = 1 << tick.mezzBit();
        uint256 termMask = 1 << tick.termBit();
        census.mezzanine_[encodeMezz(poolIdx, tick)] |= mezzMask;
        census.terminus_[encodeTerm(poolIdx, tick)] |= termMask;
    }

    /* @notice Unset the tick index as no longer active. Take care of any book keeping
     *   related to the recursive bitmap levels.
     * @dev Idempontent. Can be called repeatedly even if tick was previously 
     *   forgotten. */
    function forgetTick (TickCensus storage census, uint16 poolIdx, int24 tick) internal {
        uint256 mezzMask = ~(1 << tick.mezzBit());
        uint256 termMask = ~(1 << tick.termBit());

        bytes32 termIdx = encodeTerm(poolIdx, tick);
        uint256 termUpdate = census.terminus_[termIdx] & termMask;
        census.terminus_[termIdx] = termUpdate;
        
        if (termUpdate == 0) {
            bytes32 mezzIdx = encodeMezz(poolIdx, tick);
            uint256 mezzUpdate = census.mezzanine_[mezzIdx] & mezzMask;
            census.mezzanine_[mezzIdx] = mezzUpdate;
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
     * @param isUpper - If true indicates that we're looking for an upper boundary.
     * @param startTick - The current tick index that we're finding the boundary from.
     * @param termBitmap - The previously loaded terminus bitmap associated with the
     *    starting tick. It's the caller's responsibility to make sure this is correct.
     *
     * @return boundTick - The tick index that we can conservatively roll to before 
     *    potentially hitting an initialized liquidity bump.
     * @return isSpill - If true indicates that the boundary represents the end of the
     *    terminus bitmap. Could or could not also still be an active bump, but only
     *    at the lower bound (because lower bounds exist in the bitmap, but upper bounds
     *    exist at the next bitmap over). */
    function pinBitmap (bool isUpper, int24 startTick, uint256 termBitmap)
        internal pure returns (int24 boundTick, bool isSpill) {
        uint16 shiftTerm = startTick.termBump(isUpper);
        int16 tickMezz = startTick.mezzKey();
        (boundTick, isSpill) = pinTermMezz
            (isUpper, shiftTerm, tickMezz, termBitmap);
    }

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
     * @param borderTick - The current tick that we want to seek a tick liquidity
     *   boundary from. For defined behavior this tick must occur at the border of
     *   terminus bitmap. For lower borders, must be the tick from the start of the byte.
     *   For upper borders, must be the tick past the end of the byte. Any spill result 
     *   from pinTermMezz() is safe.
     * @param isUpper - The direction of the boundary. If true seek an upper boundary.
     *
     * @return (int24) - The tick index of the next tick boundary with an active 
     *   liquidity bump. The result is assymetric boundary for upper/lower ticks. 
     * @return (uint256) - The bitmap associated with the terminus of the boundary
     *   tick. Loaded here for gas efficiency reasons. */
    function seekMezzSpill (TickCensus storage census, uint16 poolIdx,
                            int24 borderTick, bool isUpper)
        internal view returns (int24) {
        (uint8 lobbyBorder, uint8 mezzBorder) = rootsForBorder(borderTick, isUpper);

        // Most common case is that the next neighboring bitmap on the border has
        // an active tick. So first check here to save gas in the hotpath.
        (int24 pin, bool spills) =
            seekAtTerm(census, poolIdx, lobbyBorder, mezzBorder, isUpper);
        if (!spills) { return pin; }                                      

        // Next check to see if we can find a neighbor in the mezzanine. This almost
        // always happens except for very sparse pools. 
        (pin, spills) =
            seekAtMezz(census, poolIdx, lobbyBorder, mezzBorder, isUpper);
        if (!spills) { return pin; }

        // Finally iterate through the lobby layer.
        return seekOverLobby(census, poolIdx, lobbyBorder, isUpper);
    }

    function seekAtTerm (TickCensus storage census, uint16 poolIdx, uint8 lobbyBit,
                         uint8 mezzBit, bool isUpper)
        private view returns (int24, bool) {
        uint256 neighborBitmap = census.terminus_
            [encodeTermWord(poolIdx, lobbyBit, mezzBit)];
        (uint8 termBit, bool spills) = neighborBitmap.bitAfterTrunc(0, isUpper);
        if (spills) { return (0, true); }
        return (Bitmaps.weldLobbyPosMezzTerm(lobbyBit, mezzBit, termBit), false);
    }

    function seekAtMezz (TickCensus storage census, uint16 poolIdx, uint8 lobbyBit,
                         uint8 mezzBorder, bool isUpper)
        private view returns (int24, bool) {
        uint256 neighborMezz = census.mezzanine_
            [encodeMezzWord(poolIdx, lobbyBit)];
        uint8 mezzShift = Bitmaps.bitRelate(mezzBorder, isUpper);
        (uint8 mezzBit, bool spills) = neighborMezz.bitAfterTrunc(mezzShift, isUpper);
        if (spills) { return (0, true); }
        return seekAtTerm(census, poolIdx, lobbyBit, mezzBit, isUpper);
    }

    function seekOverLobby (TickCensus storage census, uint16 poolIdx, uint8 lobbyBit,
                            bool isUpper)
        private view returns (int24) {
        return isUpper ?
            seekLobbyUp(census, poolIdx, lobbyBit) :
            seekLobbyDown(census, poolIdx, lobbyBit);
    }

    /* Unlike the terminus and mezzanine layer, we don't store a bitmap at the lobby
     * layer. Instead we iterate through the top-level bits until we find an active
     * mezzanine. This requires a maximum of 256 iterations, and can be gas intensive.
     * However moves at this level represent 65,000% price changes and are very rare. */
    function seekLobbyUp (TickCensus storage census, uint16 poolIdx, uint8 lobbyBit)
        private view returns (int24) {
        uint8 MAX_MEZZ = 0;
        unchecked {
            // Because it's unchecked idx will wrap around to 0 when it checks all bits
            for (uint8 i = lobbyBit + 1; i > 0; ++i) {
                (int24 tick, bool spills) = seekAtMezz(census, poolIdx, i,
                                                       MAX_MEZZ, true);
                if (!spills) { return tick; }
            }
        }
        return Bitmaps.zeroTick(true);
    }

    /* Same logic as seekLobbyUp(), but the inverse direction. */
    function seekLobbyDown (TickCensus storage census, uint16 poolIdx, uint8 lobbyBit)
        private view returns (int24) {
        uint8 MIN_MEZZ = 255;
        unchecked {
            // Because it's unchecked idx will wrap around to 255 when it checks all bits
            for (uint8 i = lobbyBit - 1; i < 255; --i) {
                (int24 tick, bool spills) = seekAtMezz(census, poolIdx, i,
                                                       MIN_MEZZ, false);
                if (!spills) { return tick; }
            }
        }
        return Bitmaps.zeroTick(false);
    }
    
    function rootsForBorder (int24 borderTick, bool isUpper) private pure
        returns (uint8 lobbyBit, uint8 mezzBit) {
        // Because pinTermMezz returns a border *on* the previous bitmap, we need to
        // decrement by one to get the seek starting point.
        int24 pinTick = isUpper ? borderTick : (borderTick - 1);
        lobbyBit = pinTick.lobbyBit();
        mezzBit = pinTick.mezzBit();
    }

    function encodeMezz (uint16 poolIdx, int24 tick) private pure returns (bytes32) {
        int8 wordPos = tick.lobbyKey();
        return keccak256(abi.encodePacked(poolIdx, wordPos)); 
    }

    function encodeTerm (uint16 poolIdx, int24 tick) private pure returns (bytes32) {
        int16 wordPos = tick.mezzKey();
        return keccak256(abi.encodePacked(poolIdx, wordPos)); 
    }

    function encodeMezzWord (uint16 poolIdx, int8 lobbyPos)
        private pure returns (bytes32) {
        return keccak256(abi.encodePacked(poolIdx, lobbyPos));  
    }

    function encodeMezzWord (uint16 poolIdx, uint8 lobbyPos)
        private pure returns (bytes32) {
        return encodeMezzWord(poolIdx, Bitmaps.uncastBitmapIndex(lobbyPos));
    }

    function encodeTermWord (uint16 poolIdx, uint8 lobbyPos, uint8 mezzPos)
        private pure returns (bytes32) {
        int16 mezzIdx = Bitmaps.weldLobbyMezz
            (Bitmaps.uncastBitmapIndex(lobbyPos), mezzPos);
        return keccak256(abi.encodePacked(poolIdx, mezzIdx)); 
    }
}

