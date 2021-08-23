// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;

import "./FixedPoint128.sol";
import "./FullMath.sol";
import "./LowGasSafeMath.sol";
import "./TickMath.sol";

/* @title Compounding math library
 * @notice Library provides convenient math functionality for various transformations
 *         and reverse transformations related to compound growth. */
library CompoundMath {
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;

    /* @notice Provides a safe lower-bound approximation of the square root of 1+x
     *         based on a two-term Taylor series expansion.
     * @dev    Due to approximation error, only safe to use on input in the range of 
     *         [0,1)
     * @params x  The value of x in (1+x). Represented as a 128-bit fixed-point
     * @returns   The value of y for which (1+y) = sqrt(1+x). Represented as 128-bit
     *            fixed point. */
    function approxSqrtCompound (uint256 x) internal pure returns (uint256) {
        // Taylor series error becomes too large above 2.0. Approx is still conservative
        // but the angel's share becomes unreasonble. 
        require(x < FixedPoint128.Q128, "C");
        
        uint256 linear = x/2;
        uint256 ONE = FixedPoint128.Q128;
        uint256 quad = FullMath.mulDiv(x, x, ONE) / 8;
        return linear - quad;
    }
    
    /* @notice Computes the result from compounding two cumulative growth rates.
     * @params x The compounded growth rate as in (1+x). Represted as 128-bit 
     *           fixed-point. 
     * @params y The compounded growth rate as in (1+y). Represted as 128-bit 
     *           fixed-point.
     * @returns The cumulative compounded growth rate as in (1+z) = (1+x)*(1+y).
     *          Represented as 128-bit fixed-point. */
    function compoundAdd (uint256 x, uint256 y) internal
        pure returns (uint256 z) {
        uint256 ONE = FixedPoint128.Q128;
        z = FullMath.mulDiv(ONE.add(x), ONE.add(y), ONE).sub(ONE);
    }

    /* @notice Computes the result from starting with a given compounded growth
     *         rate and subtracting out another fixed amount of compound growth.
     * @params x The compounded growth rate as in (1+x). Represted as 128-bit 
     *           fixed-point. 
     * @params y The compounded growth rate to shrink by as in (1+y). Represted as 
     *           128-bit fixed-point.
     * @returns The cumulative compounded growth rate as in (1+z) = (1+x)/(1+y).
     *          Represented as 128-bit fixed-point. */
    function compoundDivide (uint256 x, uint256 y) internal
        pure returns (uint256 z) {
        uint256 ONE = FixedPoint128.Q128;
        z = FullMath.mulDiv(x, ONE, y).sub(ONE);
    }

    /* @notice Computes the result from applying a compound growth rate to a fixed
     *         quantity.
     * @params seed The fixed quantity to start with, growth to be applied on top.
     *              Represented as an unsigned integer.
     * @params growth The compounded growth rate to apply, as in (1+g). Represented
     *                as 128-bit fixed-point.
     * @returns The post-growth value as in seed*(1+g). Rounded down to an unsigned
     *          integer. Round */
    function compoundGrow (uint256 seed, uint256 growth) internal
        pure returns (uint256) {
        uint256 ONE = FixedPoint128.Q128;
        uint256 multFactor = ONE + growth;
        return FullMath.mulDiv(uint256(seed), multFactor, ONE);
    }

    /* @notice Computes the result from backing out a compounded growth value from
     *         an existing value. The inverse of compoundGrow().
     * @params val The fixed quantity representing the starting value that we want
     *             to back out a pre-growth seed from.
     * @params growth The compounded growth rate to back out, as in (1+g). Represented
     *                as 128-bit fixed-point.
     * @returns The pre-growth value as in val/(1+g). Rounded down as an unsigned
     *          integer. */
    function compoundShrink (uint256 val, uint256 growth) internal
        pure returns (uint256) {
        uint256 ONE = FixedPoint128.Q128;
        uint256 multFactor = ONE + growth;
        return FullMath.mulDiv(uint256(val), ONE, multFactor);
    }
    
    /* @notice Inflates a starting value by a cumulative growth rate.
     * @param seed The pre-inflated starting value as unsigned integer
     * @param growth Cumulative growth rate as 128-bit fixed-point value.
     * @return The ending value = seed * (1 + growth). Rounded down to nearest
     *         integer value */
    function inflateLiqSeed (uint128 seed, uint256 growth)
        internal pure returns (uint128) {
        uint256 inflated = compoundGrow(seed, growth);
        return inflated > TickMath.MAX_TICK_LIQUIDITY ?
            TickMath.MAX_TICK_LIQUIDITY :
            uint128(inflated);
    }
}
