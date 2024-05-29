// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

import '../../../libraries/FixedPoint.sol';
import '../../../libraries/CurveMath.sol';
import '../../../libraries/LiquidityMath.sol';

/// @title Liquidity amount functions
/// @notice Same as LiquidityAmounts.sol library but uses CrocSwap native X64.64 prices instead
///         of Uniswap X64.96 price format
library LiquidityAmountsNative {
    /// @notice Downcasts uint256 to uint128
    /// @param x The uint258 to be downcasted
    /// @return y The passed value, downcasted to uint128
    function toUint128(uint256 x) private pure returns (uint128 y) {
        require((y = uint128(x)) == x);
    }

    /// @notice Computes the amount of liquidity received for a given amount of token0 and price range
    /// @dev Calculates amount0 * (sqrt(upper) * sqrt(lower)) / (sqrt(upper) - sqrt(lower))
    /// @param sqrtRatioAX64 A sqrt price representing the first tick boundary
    /// @param sqrtRatioBX64 A sqrt price representing the second tick boundary
    /// @param amount0 The amount0 being sent in
    /// @return liquidity The amount of returned liquidity
    function getLiquidityForAmount0(
        uint128 sqrtRatioAX64,
        uint128 sqrtRatioBX64,
        uint256 amount0
    ) internal pure returns (uint128 liquidity) {
        return LiquidityMath.shaveRoundLots(
            CurveMath.liquiditySupported(toUint128(amount0), false, sqrtRatioAX64, sqrtRatioBX64));
    }

    /// @notice Computes the amount of liquidity received for a given amount of token1 and price range
    /// @dev Calculates amount1 / (sqrt(upper) - sqrt(lower)).
    /// @param sqrtRatioAX64 A sqrt price representing the first tick boundary
    /// @param sqrtRatioBX64 A sqrt price representing the second tick boundary
    /// @param amount1 The amount1 being sent in
    /// @return liquidity The amount of returned liquidity
    function getLiquidityForAmount1(
        uint128 sqrtRatioAX64,
        uint128 sqrtRatioBX64,
        uint256 amount1
    ) internal pure returns (uint128 liquidity) {
        return LiquidityMath.shaveRoundLots(
            CurveMath.liquiditySupported(toUint128(amount1), true, sqrtRatioAX64, sqrtRatioBX64));
    }

    /// @notice Computes the maximum amount of liquidity received for a given amount of token0, token1, the current
    /// pool prices and the prices at the tick boundaries
    /// @param sqrtRatioX64 A sqrt price representing the current pool prices
    /// @param sqrtRatioAX64 A sqrt price representing the first tick boundary
    /// @param sqrtRatioBX64 A sqrt price representing the second tick boundary
    /// @param amount0 The amount of token0 being sent in
    /// @param amount1 The amount of token1 being sent in
    /// @return liquidity The maximum amount of liquidity received
    function getLiquidityForAmounts(
        uint128 sqrtRatioX64,
        uint128 sqrtRatioAX64,
        uint128 sqrtRatioBX64,
        uint256 amount0,
        uint256 amount1
    ) internal pure returns (uint128 liquidity) {
        if (sqrtRatioAX64 > sqrtRatioBX64) (sqrtRatioAX64, sqrtRatioBX64) = (sqrtRatioBX64, sqrtRatioAX64);

        if (sqrtRatioX64 <= sqrtRatioAX64) {
            liquidity = getLiquidityForAmount0(sqrtRatioAX64, sqrtRatioBX64, amount0);
        } else if (sqrtRatioX64 < sqrtRatioBX64) {
            uint128 liquidity0 = getLiquidityForAmount0(sqrtRatioX64, sqrtRatioBX64, amount0);
            uint128 liquidity1 = getLiquidityForAmount1(sqrtRatioAX64, sqrtRatioX64, amount1);

            liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
        } else {
            liquidity = getLiquidityForAmount1(sqrtRatioAX64, sqrtRatioBX64, amount1);
        }
    }

    /// @notice Computes the amount of token0 for a given amount of liquidity and a price range
    /// @param sqrtRatioAX64 A sqrt price representing the first tick boundary
    /// @param sqrtRatioBX64 A sqrt price representing the second tick boundary
    /// @param liquidity The liquidity being valued
    /// @return amount0 The amount of token0
    function getAmount0ForLiquidity(
        uint128 sqrtRatioAX64,
        uint128 sqrtRatioBX64,
        uint128 liquidity
    ) internal pure returns (uint256 amount0) {
        return CurveMath.deltaQuote(liquidity, sqrtRatioAX64, sqrtRatioBX64);
    }

    /// @notice Computes the amount of token1 for a given amount of liquidity and a price range
    /// @param sqrtRatioAX64 A sqrt price representing the first tick boundary
    /// @param sqrtRatioBX64 A sqrt price representing the second tick boundary
    /// @param liquidity The liquidity being valued
    /// @return amount1 The amount of token1
    function getAmount1ForLiquidity(
        uint128 sqrtRatioAX64,
        uint128 sqrtRatioBX64,
        uint128 liquidity
    ) internal pure returns (uint256 amount1) {
        return CurveMath.deltaBase(liquidity, sqrtRatioAX64, sqrtRatioBX64);
    }

    /// @notice Computes the token0 and token1 value for a given amount of liquidity, the current
    /// pool prices and the prices at the tick boundaries
    /// @param sqrtRatioX64 A sqrt price representing the current pool prices
    /// @param sqrtRatioAX64 A sqrt price representing the first tick boundary
    /// @param sqrtRatioBX64 A sqrt price representing the second tick boundary
    /// @param liquidity The liquidity being valued
    /// @return amount0 The amount of token0
    /// @return amount1 The amount of token1
    function getAmountsForLiquidity(
        uint128 sqrtRatioX64,
        uint128 sqrtRatioAX64,
        uint128 sqrtRatioBX64,
        uint128 liquidity
    ) internal pure returns (uint256 amount0, uint256 amount1) {
        if (sqrtRatioAX64 > sqrtRatioBX64) (sqrtRatioAX64, sqrtRatioBX64) = (sqrtRatioBX64, sqrtRatioAX64);

        if (sqrtRatioX64 <= sqrtRatioAX64) {
            amount0 = getAmount0ForLiquidity(sqrtRatioAX64, sqrtRatioBX64, liquidity);
        } else if (sqrtRatioX64 < sqrtRatioBX64) {
            amount0 = getAmount0ForLiquidity(sqrtRatioX64, sqrtRatioBX64, liquidity);
            amount1 = getAmount1ForLiquidity(sqrtRatioAX64, sqrtRatioX64, liquidity);
        } else {
            amount1 = getAmount1ForLiquidity(sqrtRatioAX64, sqrtRatioBX64, liquidity);
        }
    }
}
