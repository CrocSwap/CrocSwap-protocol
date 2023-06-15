// SPDX-License-Identifier: GPL-3
pragma solidity 0.8.19;

import "./FixedPoint.sol";
import "./TickMath.sol";
import "./SafeCast.sol";

/* @title Compounding math library
 * @notice Library provides convenient math functionality for various transformations
 *         and reverse transformations related to compound growth. */
library CompoundMath {
    using SafeCast for uint256;

    /* @notice Provides a safe lower-bound approximation of the square root of (1+x)
     *         based on a two-term Taylor series expansion. The purpose is to calculate
     *         the square root for small compound growth rates. 
     * 
     *         Both the input and output values are passed as the growth rate *excluding*
     *         the 1.0 multiplier base. For example assume the input (X) is 0.1, then the
     *         output Y is:
     *             (1 + Y) = sqrt(1+X)
     *             (1 + Y) = sqrt(1 + 0.1)
     *             (1 + Y) = 1.0488 (approximately)
     *                   Y = 0.0488 (approximately)
     *         In the example the square root of 10% compound growth is 4.88%
     *
     *         Another example, assume the input (X) is 0.6, then the output (Y) is:
     *             (1 + Y) = sqrt(1+X)
     *             (1 + Y) = sqrt(1 + 0.6)
     *             (1 + Y) = 1.264 (approximately)
     *                   Y = 0.264 (approximately)
     *         In the example the square root of 60% growth is 26.4% compound growth
     *
     *         Another example, assume the input (X) is 0.018, then the output (Y) is:
     *             (1 + Y) = sqrt(1+X)
     *             (1 + Y) = sqrt(1 + 0.018)
     *             (1 + Y) = 1.00896 (approximately)
     *                   Y = 0.00896 (approximately)
     *         In the example the square root of 1.8% growth is 0.896% compound growth
     *
     * @dev    Due to approximation error, only safe to use on input in the range of 
     *         [0,1). Will always round down from the true real value.
     *
     * @param x  The value of x in (1+x). Represented as a Q16.48 fixed-point
     * @returns   The value of y for which (1+y) = sqrt(1+x). Represented as Q16.48 fixed point
     * */
    function approxSqrtCompound (uint64 x64) internal pure returns (uint64) {
        // Taylor series error becomes too large above 2.0. Approx is still conservative
        // but the angel's share becomes unreasonable. 
        require(x64 < FixedPoint.Q48);

        unchecked {
        uint256 x = uint256(x64);
        // Shift by 48, to bring x^2 back in fixed point precision
        uint256 xSq = (x * x) >> 48; // x * x never overflows 256 bits, because x is 64 bits
        uint256 linear = x >> 1; // Linear Taylor series term is x/2
        uint256 quad = xSq >> 3; // Quadratic Tayler series term ix x^2/8;

        // This will always fit in 64 bits because result is smaller than original/
        // Will always be greater than 0, because x^2 < x for x < 1
        return uint64(linear - quad);
        }
    }

    /* @notice Computes the result from compounding two cumulative growth rates.
     * @dev    Rounds down from the real value. Caps the result if type exceeds the max
     *         fixed-point value.
     * @param x The compounded growth rate as in (1+x). Represted as Q16.48 fixed-point.
     * @param y The compounded growth rate as in (1+y). Represted as Q16.48 fixed-point.
     * @returns The cumulative compounded growth rate as in (1+z) = (1+x)*(1+y).
     *          Represented as Q16.48 fixed-point. */
    function compoundStack (uint64 x, uint64 y) internal
        pure returns (uint64) {
        unchecked {
        uint256 ONE = FixedPoint.Q48;
        uint256 num = (ONE + x) * (ONE + y); // Never overflows 256-bits because x and y are 64 bits
        uint256 term = num >> 48;  // Divide by 48-bit ONE
        uint256 z = term - ONE; // term will always be >= ONE
        if (z >= type(uint64).max) { return type(uint64).max; }
        return uint64(z);
        }
    }

    /* @notice Computes the result from backing out a compounded growth value from
     *         an existing value. The inverse of compoundStack().
     * @dev    Rounds down from the real value.
     * @param val The fixed price representing the starting value that we want
     *            to back out a pre-growth seed from.
     * @param deflator The compounded growth rate to back out, as in (1+g). Represented
     *                 as Q16.48 fixed-point
     * @returns The pre-growth value as in val/(1+g). Rounded down as an unsigned
     *          integer. */
    function compoundShrink (uint64 val, uint64 deflator) internal
        pure returns (uint64) {
        unchecked {
        uint256 ONE = FixedPoint.Q48;
        uint256 multFactor = ONE + deflator; // Never overflows because both fit inside 64 bits
        uint256 num = uint256(val) << 48; // multiply by 48-bit ONE
        uint256 z = num / multFactor; // multFactor will never be zero because it's bounded by 1
        return uint64(z); // Will always fit in 64-bits because shrink can only decrease
        }
    }
    
    /* @notice Computes the implied compound growth rate based on the division of two
     *     arbitrary quantities.
     * @dev    Based on this function's use, calulated growth rate will always be 
     *         capped at 100%. The implied growth rate must always be non-negative.
     * @param inflated The larger value to be divided. Any 128-bit integer or fixed point
     * @param seed The smaller value to use as a divisor. Any 128-bit integer or fixed 
     *             point.
     * @returns The cumulative compounded growth rate as in (1+z) = (1+x)/(1+y).
     *          Represeted as Q16.48. */
    function compoundDivide (uint128 inflated, uint128 seed) internal
        pure returns (uint64) {
        // Otherwise arithmetic doesn't safely fit in 256 -bit
        require(inflated < type(uint208).max && inflated >= seed);

        unchecked {
        uint256 ONE = FixedPoint.Q48;
        uint256 num = uint256(inflated) << 48;
        uint256 z = (num / seed) - ONE; // Never underflows because num is always greater than seed

        if (z >= ONE) { return uint64(ONE); }
        return uint64(z);
        }
    }

    /* @notice Calculates a final price from applying a growth rate to a starting price.
     * @dev    Always rounds in the direction of @shiftUp
     * @param price The starting price to be compounded. Q64.64 fixed point.
     * @param growth The compounded growth rate to apply, as in (1+g). Represented
     *                as Q16.48 fixed-point
     * @param shiftUp If true compounds the starting price up, so the result will be 
     *                greater. If false, compounds the price down so the result will be
     *                smaller than the original price.
     * @returns The post-growth price as in price*(1+g) (or price*(1-g) if shiftUp is 
     *          false). Q64.64 always rounded in the direction of shiftUp. */
    function compoundPrice (uint128 price, uint64 growth, bool shiftUp) internal
        pure returns (uint128) {
        unchecked {
        uint256 ONE = FixedPoint.Q48;
        uint256 multFactor = ONE + growth; // Guaranteed to fit in 65-bits
        
        if (shiftUp) {
            uint256 num = uint256(price) * multFactor; // Guaranteed to fit in 193 bits
            uint256 z = num >> 48; // De-scale by the 48-bit growth precision
            return (z+1).toUint128(); // Round in the price shift
        } else {
            uint256 num = uint256(price) << 48;
            // No need to safe cast, since this will be smaller than original price
            return uint128(num / multFactor); 
        }
        }
    }

    
    /* @notice Inflates a starting value by a cumulative growth rate.
     * @dev    Rounds down from the real value. Result is capped at max(uint128).
     * @param seed The pre-inflated starting value as unsigned integer
     * @param growth Cumulative growth rate as Q16.48 fixed-point
     * @return The ending value = seed * (1 + growth). Rounded down to nearest
     *         integer value */
    function inflateLiqSeed (uint128 seed, uint64 growth)
        internal pure returns (uint128) {
        unchecked {
        uint256 ONE = FixedPoint.Q48;
        uint256 num = uint256(seed) * uint256(ONE + growth); // Guaranteed to fit in 256
        uint256 inflated = num >> 48; // De-scale by the 48-bit growth precision;
        
        if (inflated > type(uint128).max) { return type(uint128).max; }
        return uint128(inflated);
        }
    }

    /* @notice Deflates a starting value by a cumulative growth rate.
     * @dev    Rounds down from the real value.
     * @param liq The post-inflated liquidity as unsigned integer
     * @param growth Cumulative growth rate as Q16.48 fixed-point
     * @return The ending value = liq / (1 + growth). Rounded down to nearest
     *         integer value */
    function deflateLiqSeed (uint128 liq, uint64 growth)
        internal pure returns (uint128) {
        unchecked {
        uint256 ONE = FixedPoint.Q48;
        uint256 num = uint256(liq) << 48;
        uint256 deflated = num / (ONE + growth); // Guaranteed to fit in 256-bits
        
        // No need to safe cast-- will allways be smaller than starting
        return uint128(deflated);
        }
    }
}
