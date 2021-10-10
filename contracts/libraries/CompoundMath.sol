// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.8.4;

import "./FixedPoint.sol";
import "./FullMath.sol";
import "./LowGasSafeMath.sol";
import "./TickMath.sol";
import "./SafeCast.sol";

/* @title Compounding math library
 * @notice Library provides convenient math functionality for various transformations
 *         and reverse transformations related to compound growth. */
library CompoundMath {
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using SafeCast for uint256;

    /* @notice Provides a safe lower-bound approximation of the square root of 1+x
     *         based on a two-term Taylor series expansion.
     * @dev    Due to approximation error, only safe to use on input in the range of 
     *         [0,1). Will always round down from the true real value.
     * @param x  The value of x in (1+x). Represented as a 128-bit fixed-point
     * @returns   The value of y for which (1+y) = sqrt(1+x). Represented as 128-bit
     *            fixed point. */
    function approxSqrtCompound (uint64 x) internal pure returns (uint64) {
        // Taylor series error becomes too large above 2.0. Approx is still conservative
        // but the angel's share becomes unreasonble. 
        require(x < FixedPoint.Q48, "C");
        
        uint256 linear = x/2;
        uint256 ONE = FixedPoint.Q48;
        uint256 quad = FullMath.mulDiv(x, x, ONE) / 8;
        return uint64(linear - quad);
    }

    /* @notice Computes the result from compounding two cumulative growth rates.
     * @dev    Rounds down from the real value.
     * @param x The compounded growth rate as in (1+x). Represted as 128-bit 
     *           fixed-point. 
     * @param y The compounded growth rate as in (1+y). Represted as 128-bit 
     *           fixed-point.
     * @returns The cumulative compounded growth rate as in (1+z) = (1+x)*(1+y).
     *          Represented as 128-bit fixed-point. */
    function compoundStack (uint64 x, uint64 y) internal
        pure returns (uint64) {
        uint256 ONE = FixedPoint.Q48;
        uint256 z = FullMath.mulDiv(ONE.add(x), ONE.add(y), ONE).sub(ONE);
        if (z >= type(uint64).max) { return type(uint64).max; }
        return uint64(z);
    }

    /* @notice Computes the result from backing out a compounded growth value from
     *         an existing value. The inverse of compoundGrow().
     * @dev    Rounds down from the real value.
     * @param price The fixed price representing the starting value that we want
     *              to back out a pre-growth seed from.
     * @param growth The compounded growth rate to back out, as in (1+g). Represented
     *                as 128-bit fixed-point.
     * @returns The pre-growth value as in val/(1+g). Rounded down as an unsigned
     *          integer. */
    function compoundShrink (uint64 val, uint64 deflator) internal
        pure returns (uint256) {
        uint256 ONE = FixedPoint.Q48;
        uint256 multFactor = ONE + deflator;
        uint256 z = FullMath.mulDiv(uint256(val), ONE, multFactor);        
        return uint64(z); // Will always fit in 64-bits because shrink can only decrease
    }
    
    /* @notice Computes the compound growth rate from based off an inflated value
     *         end value and a starting seed value.
     * @param x The compounded growth rate as in (1+x). Represted as 128-bit 
     *           fixed-point. 
     * @param y The compounded growth rate to shrink by as in (1+y). Represted as 
     *           128-bit fixed-point.
     * @returns The cumulative compounded growth rate as in (1+z) = (1+x)/(1+y).
     *          Represented as 128-bit fixed-point. */
    function compoundDivide (uint256 inflated, uint256 seed) internal
        pure returns (uint64) {
        uint256 ONE = FixedPoint.Q48;
        uint256 z = FullMath.mulDiv(inflated, ONE, seed).sub(ONE);
        if (z >= ONE) { return uint64(ONE); }
        return uint64(z);
    }

    /* @notice Computes the result from applying a compound growth rate to a fixed
     *         quantity.
     * @dev    Always rounds in the direction of @shiftUp
     * @param price The fixed price to start with, growth to be applied on top.
     *              Represented as an unsigned integer.
     * @param growth The compounded growth rate to apply, as in (1+g). Represented
     *                as 128-bit fixed-point.
     * @param shiftUp If true compounds the price up by the growth rate. If false,
     *                compounds down.
     * @returns The post-growth price as in price*(1+g). Rounded up to next unsigned
     *          price representation. */
    function compoundPrice (uint128 price, uint64 growth, bool shiftUp) internal
        pure returns (uint128) {
        uint256 ONE = FixedPoint.Q48;
        uint256 multFactor = ONE + growth;
        uint256 z = shiftUp ?
            FullMath.mulDiv(uint256(price), multFactor, ONE) + 1 :
            FullMath.mulDiv(uint256(price), ONE, multFactor);
        return z.toUint128();
    }

    
    /* @notice Inflates a starting value by a cumulative growth rate.
     * @dev    Rounds down from the real value.
     * @param seed The pre-inflated starting value as unsigned integer
     * @param growth Cumulative growth rate as 64-bit fixed-point value.
     * @return The ending value = seed * (1 + growth). Rounded down to nearest
     *         integer value */
    function inflateLiqSeed (uint128 seed, uint64 growth)
        internal pure returns (uint128) {
        uint256 ONE = FixedPoint.Q48;
        uint256 inflated = FullMath.mulDiv(seed, ONE.add(growth), ONE);
        return inflated > type(uint128).max ?
            type(uint128).max :
            inflated.toUint128();
    }

    /* @notice Deflates a starting value by a cumulative growth rate.
     * @dev    Rounds down from the real value.
     * @param liq The post-inflated liquidity as unsigned integer
     * @param growth Cumulative growth rate as 64-bit fixed-point value.
     * @return The ending value = liq/* (1 + growth). Rounded down to nearest
     *         integer value */
    function deflateLiqSeed (uint128 liq, uint64 growth)
        internal pure returns (uint128) {
        uint256 ONE = FixedPoint.Q48;
        uint256 deflated = FullMath.mulDiv(liq, ONE, ONE + growth);
        return deflated.toUint128();
    }
}
