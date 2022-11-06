// SPDX-License-Identifier: GPL-3
pragma solidity ^0.8.4;

import "./BitMath.sol";

/* @title Tick bitmap library
 *
 * @notice Tick bitmaps are used for the tracking of tick initialization
 *    state over a 256-bit interval. Tick indices are 24-bit integer, so
 *    this library provides for 3-layers of recursive 256-bit bitmaps. Each
 *    layer covers the first (lobby), middle (mezzanine) or last (terminus) 
 *    8-bits in the 24-bit index.*/
library Bitmaps {

    /* @notice Transforms the bitmap so the first or last N bits are set to zero.
     * @param bitmap - The original 256-bit bitmap object.
     * @param shift - The number N of slots in the bitmap to mask to zero.
     * @param right - If true mask the N bits from right to left. Otherwise from
     *                left to right.
     * @return The bitmap with N bits (on the right or left side) masked. */
    function truncateBitmap (uint256 bitmap, uint16 shift, bool right)
        pure internal returns (uint256) {
        return right ?
            (bitmap >> shift) << shift:
            (bitmap << shift) >> shift;
    }

    /* @notice - Determine the index of the first set bit in the bitmap starting
     *    after N bits from the right or the left.
     * @param bitmap - The 256-bit bitmap object.
     * @param shift - Exclude the first shift N bits from the index result.
     * @param right - If true find the first set bit starting from the right
     *   (least significant bit as EVM is big endian). Otherwise from the lefft.
     * @return idx - The index of the matching set bit. Index position is always
     *   left indexed starting at zero regardless of the @right parameter.
     * @return spills - If no matching set bit is found, this return value is set to
     *   true. */
    function bitAfterTrunc (uint256 bitmap, uint16 shift, bool right)
        pure internal returns (uint8 idx, bool spills) {
        unchecked {
        bitmap = truncateBitmap(bitmap, shift, right);
        spills = (bitmap == 0);
        if (!spills) {
            idx = right ?
                BitMath.leastSignificantBit(bitmap) :
                BitMath.mostSignificantBit(bitmap);
        }
        }
    }

    /* @notice Returns true if the bitmap's Nth bit slot is set.
     * @param bitmap - The 256 bit bitmap object.
     * @param pos - The bitmap index to check. Value is left indexed starting at zero. */
    function isBitSet (uint256 bitmap, uint8 pos) pure internal returns (bool) {
        unchecked {
        (uint idx, bool spill) = bitAfterTrunc(bitmap, pos, true);
        return !spill && idx == pos;
        }
    }

    /* @notice Converts a signed integer bitmap index to an unsigned integer. */
    function castBitmapIndex (int8 x) internal pure returns (uint8) {
        unchecked {
        return x >= 0 ? 
            uint8(x) + 128 :
            uint8(uint16(int16(x) + 128));
        }
    }

    /* @notice Converts an unsigned integer bitmap index to a signed integer. */
    function uncastBitmapIndex (uint8 x) internal pure returns (int8) {
        unchecked {
        return x < 128 ?
            int8(int16(uint16(x)) - 128) :
            int8(x - 128);
        }
    }

    /* @notice Extracts the 8-bit tick lobby index from the full 24-bit tick index. */
    function lobbyKey (int24 tick) internal pure returns (int8) {
        unchecked {
        return int8(tick >> 16);
        }
    }

    /* @notice Extracts the 16-bit tick root from the full 24-bit tick 
     * index. */
    function mezzKey (int24 tick) internal pure returns (int16) {
        unchecked {
        return int16(tick >> 8);
        }
    }

    /* @notice Extracts the 8-bit lobby bits (the last 8-bits) from the full 24-bit tick 
     * index. Result can be used to index on a lobby bitmap. */
    function lobbyBit (int24 tick) internal pure returns (uint8) {
        return castBitmapIndex(lobbyKey(tick));
    }

    /* @notice Extracts the 8-bit mezznine bits (the middle 8-bits) from the full 24-bit 
     * tick index. Result can be used to index on a mezzanine bitmap. */
    function mezzBit (int24 tick) internal pure returns (uint8) {
        unchecked {
        return uint8(uint16(mezzKey(tick) % 256));
        }
    }

    /* @notice Extracts the 8-bit terminus bits (the last 8-bits) from the full 24-bit 
     * tick index. Result can be used to index on a terminus bitmap. */
    function termBit (int24 tick) internal pure returns (uint8) {
        unchecked {
        return uint8(uint24(tick % 256));
        }
    }

    /* @notice Determines the next shift bump from a starting terminus value. Note for 
     *   upper the barrier is always to the right. For lower it's on the tick. This is
     *   because bumps always occur at the start of the tick.
     *
     * @param tick - The full 24-bit tick index.
     * @param isUpper - If true, shift and index from left-to-right. Otherwise right-to-
     *   left.
     * @return - Returns the bumped terminus bit indexed directionally based on param 
     *   isUpper. Can be 256, if the terminus bit occurs at the last slot. */  
    function termBump (int24 tick, bool isUpper) internal pure returns (uint16) {
        unchecked {
        uint8 bit = termBit(tick);
        // Bump moves up for upper, but occurs at the bottom of the same tick for lower.
        uint16 shiftTerm = isUpper ? 1 : 0;
        return uint16(bitRelate(bit, isUpper)) + shiftTerm;
        }
    }

    /* @notice Converts a directional bitmap position, to a cardinal bitmap position. For
     *   example the 20th bit for a sell (right-to-left) would be the 235th bit in
     *   the bitmap. 
     * @param bit - The directional-oriented index in the 256-bit bitmap.
     * @param isUpper - If true, the direction is left-to-right, if false right-to-left.
     * @return The cardinal (left-to-right) index in the bitmap. */
    function bitRelate (uint8 bit, bool isUpper) internal pure returns (uint8) {
        unchecked {
        return isUpper ? bit : (255 - bit);
        }
    }

    /* @notice Converts a 16-bit tick base and an 8-bit terminus tick to a full 24-bit
     *   tick index. */
    function weldMezzTerm (int16 mezzBase, uint8 termBitArg)
        internal pure returns (int24) {
        unchecked {
        return (int24(mezzBase) << 8) + int24(uint24(termBitArg));
        }
    }

    /* @notice Converts an 8-bit lobby index and an 8-bit mezzanine bit into a 16-bit 
     *   tick base root. */
    function weldLobbyMezz (int8 lobbyIdx, uint8 mezzBitArg)
        internal pure returns (int16) {
        unchecked {
        return (int16(lobbyIdx) << 8) + int16(uint16(mezzBitArg));
        }
    }

    /* @notice Converts an 8-bit lobby index, an 8-bit mezzanine bit, and an 8-bit
     *   terminus bit into a full 24-bit tick index. */
    function weldLobbyMezzTerm (int8 lobbyIdx, uint8 mezzBitArg, uint8 termBitArg)
        internal pure returns (int24) {
        unchecked {
        return (int24(lobbyIdx) << 16) +
            (int24(uint24(mezzBitArg)) << 8) +
            int24(uint24(termBitArg));
        }
    }

    
    /* @notice Converts an 8-bit lobby index, an 8-bit mezzanine bit, and an 8-bit
     *   terminus bit into a full 24-bit tick index. */
    function weldLobbyPosMezzTerm (uint8 lobbyWord, uint8 mezzBitArg, uint8 termBitArg)
        internal pure returns (int24) {
        return weldLobbyMezzTerm(Bitmaps.uncastBitmapIndex(lobbyWord),
                                 mezzBitArg, termBitArg);
    }

    /* @notice The minimum and maximum 24-bit integers are used to represent -/+ 
     *   infinity range. We have to reserve these bits as non-standard range for when
     *   price shifts past the last representable tick.
     * @return True if the tick index represents a positive or negative infinity. */
    function isTickFinite (int24 tick) internal pure returns (bool) {
        unchecked {
        return tick > type(int24).min &&
            tick < type(int24).max;
        }
    }

    /* @notice Returns the zero horizon point for the full 24-bit tick index. */
    function zeroTick (bool isUpper) internal pure returns (int24) {
        unchecked {
        return isUpper ? type(int24).max : type(int24).min;
        }
    }

    /* @notice Returns the zero horizon point equivalent for the first 16-bits of the 
     *    tick index. */
    function zeroMezz (bool isUpper) internal pure returns (int16) {
        unchecked {
        return isUpper ? type(int16).max : type(int16).min;
        }
    }

    /* @notice Returns the zero point equivalent for the terminus bit (last 8-bits) of
     *    the tick index. */
    function zeroTerm (bool isUpper) internal pure returns (uint8) {
        unchecked {
        return isUpper ? type(uint8).max : 0;
        }
    }
}
