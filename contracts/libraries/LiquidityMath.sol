// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import './SafeCast.sol';
import './FixedPoint128.sol';
import './FullMath.sol';
import './TickMath.sol';

/// @title Math library for liquidity
library LiquidityMath {
    /// @notice Add a signed liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function addDelta(uint128 x, int128 y) internal pure returns (uint128 z) {
        if (y < 0) {
            require((z = x - uint128(-y)) < x, 'LS');
        } else {
            require((z = x + uint128(y)) >= x, 'LA');
        }
    }

    /// @notice Add an unsigned liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function addDelta(uint128 x, uint128 y) internal pure returns (uint128 z) {
        require((z = x + y) >= x, 'LA');
    }

    /// @notice Subtract an unsigned liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function minusDelta(uint128 x, uint128 y) internal pure returns (uint128 z) {
        require(y <= x, 'LS');
        z = x - y;
    }

    /* @notice Inflates a starting value by a cumulative growth rate.
     * @param seed The pre-inflated starting value as unsigned integer
     * @param growth Cumulative growth rate as 128-bit fixed-point value.
     * @return The ending value = seed * (1 + growth). Rounded down to nearest
     *         integer value */
    function inflateSeed (uint128 seed, uint256 growth)
        internal pure returns (uint128) {
        uint256 ONE = FixedPoint128.Q128;
        uint256 multFactor = ONE + growth;
        uint256 inflated = FullMath.mulDiv(uint256(seed), multFactor, ONE);
        return inflated > TickMath.MAX_TICK_LIQUIDITY ?
            TickMath.MAX_TICK_LIQUIDITY :
            uint128(inflated);
    }

    /* @notice Deflates a value by a cumulative growth rate (inverse of inflateSeed())
     * @param term The post-inflated value that we want to shrink (as unsigned integer)
     * @growth growth Cumulative growth rate as 128-bit fixed-point value
     * @return The deflated value = seed / (1 + growth). Rounded down to nearest 
     *         integeger value. */
    function deflateSeed (uint128 term, uint256 growth)
        internal pure returns (uint128) {
        uint256 ONE = FixedPoint128.Q128;
        uint256 multFactor = ONE + growth;
        uint256 deflated = FullMath.mulDiv(uint256(term), ONE, multFactor);
        return uint128(deflated);
    }
}
