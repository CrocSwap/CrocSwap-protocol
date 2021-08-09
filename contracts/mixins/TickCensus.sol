// SPDX-License-Identifier: Unlicensed                                         
pragma solidity >=0.7.1;

import '../libraries/BitMath.sol';
import '../libraries/Bitmaps.sol';
import '../libraries/TickMath.sol';

contract TickCensus {
    using Bitmaps for uint256;
    using Bitmaps for int24;
    
    uint256 private rootBitmap_;
    mapping(int8 => uint256) private lobby_;
    mapping(int16 => uint256) private mezzanine_;
    
    function mezzanineBitmap (int24 tick)
        internal view returns (uint256) {
        int16 wordPos = tick.mezzKey();
        return mezzanine_[wordPos];
    }

    function lobbyBitmap (int24 tick) internal view returns (uint256) {
        int8 wordPos = tick.lobbyKey();
        return lobby_[wordPos];
    }

    function rootBitmap () internal view returns (uint256) {
        return rootBitmap_;
    }

    function hasTickBookmark (int24 tick) internal view returns (bool) {
        uint256 mezz = mezzanineBitmap(tick);
        uint8 term = tick.termBit();
        return mezz.isBitSet(term);
    }

    
    function pinBitmap (bool isBuy, int24 startTick, uint256 mezzBitmap)
        internal pure returns (int24, bool) {
        uint16 shiftTerm = startTick.termShift(isBuy);
        int16 tickMezz = startTick.mezzKey();
        return pinTermMezz(isBuy, shiftTerm, tickMezz, mezzBitmap);
    }

    function pinTermMezz (bool isBuy, uint16 shiftTerm, int16 tickMezz,
                          uint256 mezzBitmap)
        private pure returns (int24 nextTick, bool spillTick) {
        uint8 nextTerm;
        (nextTerm, spillTick) = mezzBitmap.bitAfterTrunc(shiftTerm, isBuy);
        nextTick = spillTick ?
            spillOverPin(isBuy, tickMezz) :
            Bitmaps.weldMezzTerm(tickMezz, nextTerm);
    }

    function spillOverPin (bool isBuy, int16 tickMezz) private pure returns (int24) {
        int16 stepMezz = isBuy ? tickMezz + 1 : tickMezz - 1;
        return tickMezz == Bitmaps.zeroMezz(isBuy) ?
            Bitmaps.zeroTick(isBuy) :
            Bitmaps.weldMezzTerm(stepMezz, Bitmaps.zeroBit(!isBuy));
    }

    
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
        (stepLobbyBit, spills) = rootBitmap_.bitAfterTrunc(truncShift, isBuy);
        if (stepLobbyBit == lobbyBit) {
            (,bool spillsMezz) = determineSeekMezz(lobbyBit, mezzBit, isBuy);
            if (spillsMezz) {
                (stepLobbyBit, spills) = rootBitmap_.bitAfterTrunc(truncShift + 1, isBuy);
            }
        }
    }

    function determineSeekMezz (uint8 lobbyBit, uint8 mezzBit, bool isBuy)
        private view returns (uint8 stepMezzBit, bool spillsMezz) {
        int8 lobbyIndex = Bitmaps.uncastBitmapIndex(lobbyBit);
        uint256 firstBitmap = lobby_[lobbyIndex];
        require(firstBitmap != 0, "Y");
        
        uint8 mezzShift = Bitmaps.bitRelate(mezzBit, isBuy);
        (stepMezzBit, spillsMezz) = firstBitmap.bitAfterTrunc(mezzShift, isBuy);        
    }

    function seekFromLobby (uint8 lobbyBit, bool isBuy)
        private view returns (int24, uint256) {
        return seekAtMezz(lobbyBit, Bitmaps.zeroBit(!isBuy), isBuy);
    }

    function seekAtMezz (uint8 lobbyBit, uint8 mezzBit, bool isBuy)
        private view returns (int24, uint256) {
        (uint8 newMezz, bool spillsMezz) = determineSeekMezz(lobbyBit, mezzBit, isBuy);
        require(!spillsMezz, "S");
        
        int16 mezzIdx = Bitmaps.weldLobbyMezz(Bitmaps.uncastBitmapIndex(lobbyBit), newMezz);
        uint256 mezzBitmap = mezzanine_[mezzIdx];
        require(mezzBitmap != 0, "M");
        return (Bitmaps.weldMezzTerm(mezzIdx, Bitmaps.zeroBit(!isBuy)), mezzBitmap);
    }

    function bookmarkTick (int24 tick) internal {
        uint256 lobbyMask = 1 << tick.lobbyBit();
        uint256 mezzMask = 1 << tick.mezzBit();
        uint256 termMask = 1 << tick.termBit();
        rootBitmap_ |= lobbyMask;
        lobby_[tick.lobbyKey()] |= mezzMask;
        mezzanine_[tick.mezzKey()] |= termMask;
    }
    
    function forgetTick(int24 tick) internal {
        uint256 lobbyMask = ~(1 << tick.lobbyBit());
        uint256 mezzMask = ~(1 << tick.mezzBit());
        uint256 termMask = ~(1 << tick.termBit());
        uint256 mezzUpdate = mezzanine_[tick.mezzKey()] & termMask;
        mezzanine_[tick.mezzKey()] = mezzUpdate;
        
        if (mezzUpdate == 0) {
            uint256 lobbyUpdate = lobby_[tick.lobbyKey()] & mezzMask;
            lobby_[tick.lobbyKey()] = lobbyUpdate;
            if (lobbyUpdate == 0) {
                rootBitmap_ &= lobbyMask;
            }
        }
    }
}

