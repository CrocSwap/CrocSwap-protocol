// SPDX-License-Identifier: Unlicensed                                         
pragma solidity >=0.7.1;

import '../libraries/BitMath.sol';
import '../libraries/Bitmaps.sol';
import '../libraries/TickMath.sol';

/* @title Tick bitmap census mixin.
 * @notice Tracks which tick indices have an active liquidity bump, making it gas
 *   efficient for random read and writes, and to find the next bump tick boundary
 *   on the curve. */
contract TickCensus {
    using Bitmaps for uint256;
    using Bitmaps for int24;

    /* Tick positions are stored in three layers of 8-bit/256-slot bitmaps. Recursively
     * they indicate whether a given 24-bit tick index is active. 
     *
     * The first layer (lobby) maps whether each 8-bit tick root is set. An entry will
     * be set if and only if *any* tick index in the 16-bit range is set. */
    uint256 private lobby_;
    
    /* The second layer (mezzanine) maps whether each 16-bit tick root is set. An etnry
     * will be set if and only if *any* tick index in the 8-bit range is set. Because 
     * there are 256^2 slots, this is represented as map from the first 8-bits in the
     * root to individual 8-bit/256-slot bitmaps for the middle 8-bits at that root. */
    mapping(int8 => uint256) private mezzanine_;

    /* The final layer (terminus) directly maps whether individual tick indices are
     * set. Because there are 256^3 possible slots, this is represnted as a mapping from
     * the first 16-bit tick root to individual 8-bit/256-slot bitmaps of the terminal
     * 8-bits within that root. */
    mapping(int16 => uint256) private terminus_;

    /* @notice Returns the associated bitmap for the terminus position (bottom layer) 
     * of the tick index. */
    function terminusBitmap (int24 tick)
        internal view returns (uint256) {
        int16 wordPos = tick.mezzKey();
        return terminus_[wordPos];
    }

    /* @notice Returns the associated bitmap for the mezzanine position (middle layer) 
     * of the tick index. */
    function mezzanineBitmap (int24 tick) internal view returns (uint256) {
        int8 wordPos = tick.lobbyKey();
        return mezzanine_[wordPos];
    }

    /* @notice Returns the associated bitmap for the lobby position (top layer) of the
     * tick index. */
    function lobbyBitmap() internal view returns (uint256) {
        return lobby_;
    }

    /* @notice Returns true if the tick index is currently set. */
    function hasTickBookmark (int24 tick) internal view returns (bool) {
        uint256 mezz = mezzanineBitmap(tick);
        uint8 term = tick.termBit();
        return mezz.isBitSet(term);
    }

    /* @notice Mark the tick index as active.
     * @dev Idempotent. Can be called repeatedly on previously initialized ticks. */
    function bookmarkTick (int24 tick) internal {
        uint256 lobbyMask = 1 << tick.lobbyBit();
        uint256 mezzMask = 1 << tick.mezzBit();
        uint256 termMask = 1 << tick.termBit();
        lobby_ |= lobbyMask;
        mezzanine_[tick.lobbyKey()] |= mezzMask;
        terminus_[tick.mezzKey()] |= termMask;
    }

    /* @notice Unset the tick index as no longer active. Take care of any book keeping
     *   related to the recursive bitmap levels.
     * @dev Idempontent. Can be called repeatedly even if tick was previously 
     *   forgotten. */
    function forgetTick(int24 tick) internal {
        uint256 lobbyMask = ~(1 << tick.lobbyBit());
        uint256 mezzMask = ~(1 << tick.mezzBit());
        uint256 termMask = ~(1 << tick.termBit());
        uint256 termUpdate = terminus_[tick.mezzKey()] & termMask;
        terminus_[tick.mezzKey()] = termUpdate;
        
        if (termUpdate == 0) {
            uint256 mezzUpdate = mezzanine_[tick.lobbyKey()] & mezzMask;
            mezzanine_[tick.lobbyKey()] = mezzUpdate;
            if (mezzUpdate == 0) {
                lobby_ &= lobbyMask;
            }
        }
    }

    /* @notice Finds an inner-bound conservative liquidity tick boundary based on
     *   the terminus map at a starting tick point. 
     * @dev For gas efficiency this method only looks at a previously loaded terminus
     *   bitmap. Often for moves of that size we don't even need to look past the 
     *   terminus boundary. So there's no point doing a mezzanine layer seek unless we
     *   end up needing it.
     *
     * @param isBuy - If true indicates that we're looking for an upper boundary.
     * @param startTick - The current tick index that we're finding the boundary from.
     * @param termBitmap - The previously loaded terminus bitmap associated with the
     *    starting tick. It's the caller's responsibility to make sure this is correct.
     * @return boundTick - The tick index that we can conservatively roll to before 
     *    potentially hitting an initialized liquidity bump.
     * @return isSpill - If true indicates that the boundary represents the end of the
     *    terminus bitmap rather than a known tick bump. */
    function pinBitmap (bool isBuy, int24 startTick, uint256 termBitmap)
        internal pure returns (int24 boundTick, bool isSpill) {
        uint16 shiftTerm = startTick.termShift(isBuy);
        int16 tickMezz = startTick.mezzKey();
        (boundTick, isSpill) = pinTermMezz(isBuy, shiftTerm, tickMezz, termBitmap);
    }

    function pinTermMezz (bool isBuy, uint16 shiftTerm, int16 tickMezz,
                          uint256 termBitmap)
        private pure returns (int24 nextTick, bool spillTick) {
        uint8 nextTerm;
        (nextTerm, spillTick) = termBitmap.bitAfterTrunc(shiftTerm, isBuy);
        nextTick = spillTick ?
            spillOverPin(isBuy, tickMezz) :
            Bitmaps.weldMezzTerm(tickMezz, nextTerm);
    }

    function spillOverPin (bool isBuy, int16 tickMezz) private pure returns (int24) {
        int16 stepMezz = isBuy ? tickMezz + 1 : tickMezz - 1;
        return tickMezz == Bitmaps.zeroMezz(isBuy) ?
            Bitmaps.zeroTick(isBuy) :
            Bitmaps.weldMezzTerm(stepMezz, Bitmaps.zeroTerm(!isBuy));
    }


    /* @notice Determines the next tick bump boundary tick starting using recursive
     *   bitmap lookup.
     * @dev This is a much more gas heavy operation because it recursively looks 
     *   though all three layers of bitmaps. It should only be called if pinBitmap()
     *   can't find the boundary in the terminus layer.
     *
     * @param borderTick - The current tick that we want to seek a tick liquidity
     *   boundary from. For defined behavior this tick must occur at the border of
     *   terminus bitmap. (I.e. a spill result from pinTermMezz())
     * @param isBuy - The direction of the boundary. If true seek an upper boundary.
     *
     * @return (int24) - The tick index of the next tick boundary with an active 
     *   liquidity bump.
     * @return (uint256) - The bitmap associated with the terminus of the boundary
     *   tick. Loaded here for gas efficiency reasons. */
    function seekMezzSpill (int24 borderTick, bool isBuy)
        internal view returns (int24, uint256) {
        uint8 lobbyBit = borderTick.lobbyBit();
        uint8 mezzBit = borderTick.mezzBit();
        (uint8 stepLobbyBit, bool spills) = determineSeekLobby(lobbyBit, mezzBit, isBuy);
        if (spills) {
            return (Bitmaps.zeroTick(isBuy), 0);
        } else if (lobbyBit == stepLobbyBit) {
            return seekAtMezz(lobbyBit, mezzBit, isBuy);
        } else {
            return seekFromLobby(stepLobbyBit, isBuy);
        }
    }

    function determineSeekLobby (uint8 lobbyBit, uint8 mezzBit, bool isBuy)
        private view returns (uint8 stepLobbyBit, bool spills) {
        uint8 truncShift = Bitmaps.bitRelate(lobbyBit, isBuy);
        (stepLobbyBit, spills) = lobby_.bitAfterTrunc(truncShift, isBuy);
        if (stepLobbyBit == lobbyBit) {
            (,bool spillsMezz) = determineSeekMezz(lobbyBit, mezzBit, isBuy);
            if (spillsMezz) {
                (stepLobbyBit, spills) = lobby_.bitAfterTrunc
                    (truncShift + 1, isBuy);
            }
        }
    }

    function determineSeekMezz (uint8 lobbyBit, uint8 mezzBit, bool isBuy)
        private view returns (uint8 stepMezzBit, bool spillsMezz) {
        int8 mezzIdx = Bitmaps.uncastBitmapIndex(lobbyBit);
        uint256 firstBitmap = mezzanine_[mezzIdx];
        require(firstBitmap != 0, "Y");
        
        uint8 mezzShift = Bitmaps.bitRelate(mezzBit, isBuy);
        (stepMezzBit, spillsMezz) = firstBitmap.bitAfterTrunc(mezzShift, isBuy);        
    }

    function seekFromLobby (uint8 lobbyBit, bool isBuy)
        private view returns (int24, uint256) {
        return seekAtMezz(lobbyBit, Bitmaps.zeroTerm(!isBuy), isBuy);
    }

    function seekAtMezz (uint8 lobbyBit, uint8 mezzBit, bool isBuy)
        private view returns (int24, uint256) {
        (uint8 newMezz, bool spillsMezz) = determineSeekMezz
            (lobbyBit, mezzBit, isBuy);
        require(!spillsMezz, "S");

        int16 mezzIdx = Bitmaps.weldLobbyMezz(Bitmaps.uncastBitmapIndex(lobbyBit),
                                              newMezz);
        uint256 termBitmap = terminus_[mezzIdx];
        require(termBitmap != 0, "M");
        return (Bitmaps.weldMezzTerm(mezzIdx, Bitmaps.zeroTerm(!isBuy)), termBitmap);
    }

}

