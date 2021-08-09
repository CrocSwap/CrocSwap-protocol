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

    function addDelta(uint128 x, uint128 y) internal pure returns (uint128 z) {
        require((z = x + y) >= x, 'LA');
    }

    function minusDelta(uint128 x, uint128 y) internal pure returns (uint128 z) {
        require(y <= x, 'LS');
        z = x - y;
    }

    function inflateSeed (uint128 seed, uint256 growth)
        internal pure returns (uint128) {
        uint256 ONE = FixedPoint128.Q128;
        uint256 multFactor = ONE + growth;
        uint256 inflated = FullMath.mulDiv(uint256(seed), multFactor, ONE);
        return inflated > TickMath.MAX_TICK_LIQUIDITY ?
            TickMath.MAX_TICK_LIQUIDITY :
            uint128(inflated);
    }

    function deflateSeed (uint128 seed, uint256 growth)
        internal pure returns (uint128) {
        uint256 ONE = FixedPoint128.Q128;
        uint256 multFactor = ONE + growth;
        uint256 deflated = FullMath.mulDiv(uint256(seed), ONE, multFactor);
        return uint128(deflated);
    }
}
