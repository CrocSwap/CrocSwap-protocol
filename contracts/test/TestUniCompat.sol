// SPDX-License-Identifier: GPL-2.0-or-later

pragma solidity 0.8.19;

import '../periphery/uniCompat/libraries/OracleLibrary.sol';
import '../periphery/uniCompat/libraries/LiquidityAmounts.sol';
import '../periphery/uniCompat/libraries/LiquidityAmountsNative.sol';

contract TestUniCompat {
    function getQuoteAtTick(
        int24 tick,
        uint128 baseAmount,
        address baseToken,
        address quoteToken
    ) external pure returns (uint256 quoteAmount) {
        return OracleLibrary.getQuoteAtTick(tick, baseAmount, baseToken, quoteToken);
    }

    function getChainedPrice(address[] memory tokens, int24[] memory ticks) external pure returns (int256 syntheticTick) {
        return OracleLibrary.getChainedPrice(tokens, ticks);
    }

    function getLiquidityForAmounts(
        uint160 sqrtPriceX96,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96,
        uint256 amount0,
        uint256 amount1
    ) external pure returns (uint128 liquidityAmount) {
        return LiquidityAmounts.getLiquidityForAmounts(sqrtPriceX96, sqrtPriceAX96, sqrtPriceBX96, 
            amount0, amount1);
    }

    function getLiquidityForAmountsNative(
        uint128 sqrtPriceX64,
        uint128 sqrtPriceAX64,
        uint128 sqrtPriceBX64,
        uint256 amount0,
        uint256 amount1
    ) external pure returns (uint128 liquidityAmount) {
        return LiquidityAmountsNative.getLiquidityForAmounts(sqrtPriceX64, sqrtPriceAX64, sqrtPriceBX64, 
            amount0, amount1);
    }
}