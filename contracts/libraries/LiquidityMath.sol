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
            require((z = x - uint128(-y)) < x, 'LS');
        } else {
            require((z = x + uint128(y)) >= x, 'LA');
        }
        }
    }

    /// @notice Add an unsigned liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function addDelta(uint128 x, uint128 y) internal pure returns (uint128 z) {
        unchecked {
        require((z = x + y) >= x, 'LA');
        }
    }

    /// @notice Add an unsigned liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function addLots(uint96 x, uint96 y) internal pure returns (uint96 z) {
        unchecked {
        require((z = x + y) >= x, 'LA');
        }
    }

    /// @notice Subtract an unsigned liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function minusDelta(uint128 x, uint128 y) internal pure returns (uint128 z) {
        require(y <= x, 'LS');
        z = x - y;
    }

    function minusLots(uint96 x, uint96 y) internal pure returns (uint96 z) {
        require(y <= x, 'LS');
        z = x - y;
    }

    uint16 constant LOT_SIZE = 1024;
    uint8 constant LOT_SIZE_BITS = 10;
    
    function liquidityToLots (uint128 liq) internal pure returns (uint96) {
        unchecked {
            uint256 lots = liq >> LOT_SIZE_BITS;
            require(lots << LOT_SIZE_BITS == liq, "OD");
            require(lots < type(uint96).max, "MQ");
            return uint96(lots);
        }
    }

    function lotsToLiquidity (uint96 lots) internal pure returns (uint128) {
        uint128 liq = uint128(lots);
        return liq >> LOT_SIZE_BITS;
    }

    function netLotsOnLiquidity (uint96 incrLots, uint96 decrLots) internal pure
        returns (int128) {
        return lotToNetLiq(incrLots) - lotToNetLiq(decrLots);
    }

    function lotToNetLiq (uint96 lots) internal pure returns (int128) {
        return int128(uint128(lots) << LOT_SIZE_BITS);
    }
}
