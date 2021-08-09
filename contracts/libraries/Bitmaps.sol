// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;

import "./BitMath.sol";

/* @title Tick bitmap library
 * @notice Tick bitmaps are used for the tracking of tick initialization
 *    state over a 256-bit interval. */
library Bitmaps {

    function truncateBitmap (uint256 bitmap, uint16 shift, bool right)
        pure internal returns (uint256) {
        return right ?
            (bitmap >> shift) << shift:
            (bitmap << shift) >> shift;
    }

    function bitAfterTrunc (uint256 bitmap, uint16 shift, bool right)
        pure internal returns (uint8 idx, bool spills) {
        bitmap = truncateBitmap(bitmap, shift, right);
        spills = (bitmap == 0);
        if (!spills) {
            idx = right ?
                BitMath.leastSignificantBit(bitmap) :
                BitMath.mostSignificantBit(bitmap);
        }
    }

    function isBitSet (uint256 bitmap, uint8 pos) pure internal returns (bool) {
        (uint idx, bool spill) = bitAfterTrunc(bitmap, pos, true);
        return !spill && idx == pos;
    }

    function castBitmapIndex (int8 x) internal pure returns (uint8) {
        return x >= 0 ? 
            uint8(x) + 128 :
            uint8(int16(x) + 128);
    }

    function uncastBitmapIndex (uint8 x) internal pure returns (int8) {
        return x < 128 ?
            int8(int16(x) - 128) :
            int8(x - 128);
    }

    function lobbyKey (int24 tick) internal pure returns (int8) {
        return int8(tick >> 16);
    }

    function mezzKey (int24 tick) internal pure returns (int16) {
        return int16(tick >> 8);
    }

    function lobbyBit (int24 tick) internal pure returns (uint8) {
        return castBitmapIndex(lobbyKey(tick));
    }

    function mezzBit (int24 tick) internal pure returns (uint8) {
        return uint8(mezzKey(tick) % 256);
    }

    function termBit (int24 tick) internal pure returns (uint8) {
        return uint8(tick % 256);
    }
    
    function termShift (int24 tick, bool isBuy) internal pure returns (uint16) {
        uint8 bit = termBit(tick);
        return bitShift(bit, isBuy);
    }

    function bitShift (uint8 bit, bool isBuy) internal pure returns (uint16) {
        return uint16(bitRelate(bit, isBuy)) + 1;
    }

    function bitRelate (uint8 bit, bool isBuy) internal pure returns (uint8) {
        return isBuy ? bit : (255 - bit);
    }

    function weldMezzTerm (int16 mezzBase, uint8 termDigit)
        internal pure returns (int24) {
        return (int24(mezzBase) << 8) + termDigit;
    }

    function weldLobbyMezz (int8 lobbyIdx, uint8 mezzDigit)
        internal pure returns (int16) {
        return (int16(lobbyIdx) << 8) + mezzDigit;
    }

    function weldLobbyMezzTerm (int8 lobbyIdx, uint8 mezzDigit, uint8 termDigit)
        internal pure returns (int24) {
        return (int24(lobbyIdx) << 16) +
            (int24(mezzDigit) << 8) + termDigit;
    }

    function isTickFinite (int24 tick) internal pure returns (bool) {
        return tick > type(int24).min &&
            tick < type(int24).max;
    }

    function zeroTick (bool isBuy) internal pure returns (int24) {
        return isBuy ? type(int24).max : type(int24).min;
    }

    function zeroMezz (bool isBuy) internal pure returns (int16) {
        return isBuy ? type(int16).max : type(int16).min;
    }

    function zeroBit (bool isBuy) internal pure returns (uint8) {
        return isBuy ? type(uint8).max : 0;
    }
}
