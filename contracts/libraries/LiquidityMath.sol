// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import './SafeCast.sol';
import './TickMath.sol';

/// @title Math library for liquidity
library LiquidityMath {
    /// @notice Add a signed liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function addDelta(uint128 x, int128 y) internal pure returns (uint128 z) {
        unchecked {
        if (y < 0) {
            require((z = x - uint128(-y)) < x);
        } else {
            require((z = x + uint128(y)) >= x);
        }
        }
    }

    /// @notice Add an unsigned liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function addLiq(uint128 x, uint128 y) internal pure returns (uint128 z) {
        unchecked {
        require((z = x + y) >= x);
        }
    }

    /// @notice Add an unsigned liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function addLots(uint96 x, uint96 y) internal pure returns (uint96 z) {
        unchecked {
        require((z = x + y) >= x);
        }
    }

    /// @notice Subtract an unsigned liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function minusDelta(uint128 x, uint128 y) internal pure returns (uint128 z) {
        unchecked {
        require(y <= x, 'LS');
        z = x - y;
        }
    }

    /* @notice Same as minusDelta, but operates on lots of liquidity rather than outright
     *         liquiidty. */
    function minusLots(uint96 x, uint96 y) internal pure returns (uint96 z) {
        unchecked {
        require(y <= x, 'LS');
        z = x - y;
        }
    }

    /* In certain contexts we need to represent liquidity, but don't have the full 128 
     * bits or precision. The compromise is to use "lots" of liquidity, which is liquidity
     * represented as multiples of 1024. Usually in those contexts, max lots is capped at
     * 2^96 (equivalent to 2^108 of liquidity.) */
    uint16 constant LOT_SIZE = 1024;
    uint8 constant LOT_SIZE_BITS = 10;

    /* @notice Converts raw liquidity to lots of liquidity. (See comment above defining
     *         lots. */
    function liquidityToLots (uint128 liq) internal pure returns (uint96) {
        unchecked {
            uint256 lots = liq >> LOT_SIZE_BITS;
            require(lots << LOT_SIZE_BITS == liq, "OD");
            require(lots < type(uint96).max, "MQ");
            return uint96(lots);
        }
    }

    /* @notice Trunacates an existing liquidity quantity into a quantity that's a multiple
     *         of the 1024-multiplier defining lots of liquidity. */
    function shaveRoundLots (uint128 liq) internal pure returns (uint128) {
        return (liq >> LOT_SIZE_BITS) << LOT_SIZE_BITS;
    }

    /* @notice Trunacates an existing liquidity quantity into a quantity that's a multiple
     *         of the 1024-multiplier defining lots of liquidity, but rounds up to the
     *         next multiple. */
    function shaveRoundLotsUp (uint128 liq) internal pure returns (uint128) {
        return ((liq >> LOT_SIZE_BITS) + 1) << LOT_SIZE_BITS;
    }

    /* @notice Gives a number of lots of liquidity converts to raw liquidity value. */
    function lotsToLiquidity (uint96 lots) internal pure returns (uint128) {
        uint128 liq = uint128(lots);
        return liq >> LOT_SIZE_BITS;
    }

    /* @notice Given a positive and negative detla lots value net out the raw liquidity
     *         delta. */
    function netLotsOnLiquidity (uint96 incrLots, uint96 decrLots) internal pure
        returns (int128) {
        return lotToNetLiq(incrLots) - lotToNetLiq(decrLots);
    }

    /* @notice Given an amount of lots of liquidity converts to a signed raw liquidity
     *         delta. (Which by definition is always positive.) */
    function lotToNetLiq (uint96 lots) internal pure returns (int128) {
        return int128(uint128(lots) << LOT_SIZE_BITS);
    }
}
