// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/TickMath.sol';
import '../libraries/CurveMath.sol';
import '../libraries/PoolSpecs.sol';

import "hardhat/console.sol";

interface UniswapV3Pool {
  function slot0 () external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked);
}

contract FeeOracle {
  uint24 feeMin;
  uint24 feeMax;
  PoolSpecs.Pool pool;
  CurveMath.CurveState curve;
  UniswapV3Pool uniswapPool30;
  UniswapV3Pool uniswapPool5;

  constructor (uint24 _feeMin, uint24 _feeMax, PoolSpecs.Pool memory _pool, CurveMath.CurveState memory _curve, address _uniswapPool30, address _uniswapPool5) {
    feeMin = _feeMin;
    feeMax = _feeMax;
    pool = _pool;
    curve = _curve;
    uniswapPool30 = UniswapV3Pool(_uniswapPool30);
    uniswapPool5 = UniswapV3Pool(_uniswapPool5);
  }

  /// @notice Converts an integer into a Q64.64 fixed point representation.
  /// @param x A 64-bit unsigned integer to convert into Q64.64 format.
  function convQ64(uint128 x) internal pure returns (uint128) {
    return x << 64;
  }

  /// @notice Converts a Q64.64 fixed point number into an integer by discarding all decimals.
  /// @param x A Q64.64 fixed point number to convert into a 64-bit integer
  function deconvQ64(uint128 x) internal pure returns (uint128) {
    return x >> 64;
  }

  /// @notice Multiplies two Q64.64 fixed point numbers together, returning another Q64.64 number (result assumed to be below 2^63).
  /// @param a A Q64.64 fixed point number
  /// @param b A Q64.64 fixed point number
  function mulQ64(uint128 a, uint128 b) internal pure returns (uint128) {
    return uint128((uint256(a) * uint256(b)) >> 64);
  }

  /// @notice Divides one Q64.64 fixed point number by another Q64.64 number.
  /// @param a A Q64.64 fixed point number (the numerator).
  /// @param b A Q64.64 fixed point number (the denominator).
  function divQ64(uint128 a, uint128 b) internal pure returns (uint128) {
    uint256 a_ = uint256(a);
    a_ = a_ << 64;
    return uint128(a_ / b);
  }

  /// @notice Returns the price of the CrocSwap pool in square-root Q64.64 format.
  function getPoolSqrtPrice() private view returns (uint128) {
    return curve.priceRoot_;
  }

  /// @notice Returns the price of the 30 basis point Uniswap reference pool in square-root Q64.64 format.
  function getUniswapSqrtPrice30 () private view returns (uint128) {
    (, int24 tick, , , , ,) = uniswapPool30.slot0();
    return TickMath.getSqrtRatioAtTick(tick);
  }

  /// @notice Returns the price of the 5 basis point Uniswap reference pool in square-root Q64.64 format.
  function getUniswapSqrtPrice5 () private view returns (uint128) {
    (, int24 tick, , , , ,) = uniswapPool30.slot0();
    return TickMath.getSqrtRatioAtTick(tick);
  }

  /// @notice Calculates the optimal fee rate relative to a reference pool and assuming token0 is supplied by the trader. Uses a no-slippage approximation.
  /// @param refSqrtPrice Square root of the price of the reference pool, in Q64.64 fixed point format.
  /// @param refFee Swap fee of the reference pool, in hundredths of basis points.
  function calculateDynamicFeeToken0In (uint128 refSqrtPrice, uint24 refFee) private view returns (uint24) {
    uint128 tmp = mulQ64(divQ64(refSqrtPrice, getPoolSqrtPrice()), convQ64(1) - divQ64(convQ64(refFee), convQ64(200000000)));
    if (tmp > convQ64(1)) {
      return 0;
    } else {
      return uint24(deconvQ64(mulQ64((convQ64(1) - tmp) >> 1, convQ64(100000000))));
    }
  }

  /// @notice Calculates the optimal fee rate relative to a reference pool and assuming token1 is supplied by the trader. Uses a no-slippage approximation.
  /// @param refSqrtPrice Square root of the price of the reference pool, in Q64.64 fixed point format.
  /// @param refFee Swap fee of the reference pool, in hundredths of basis points.
  function calculateDynamicFeeToken1In (uint128 refSqrtPrice, uint24 refFee) private view returns (uint24) {
    uint128 tmp = mulQ64(divQ64(getPoolSqrtPrice(), refSqrtPrice), convQ64(1) - divQ64(convQ64(refFee), convQ64(200000000)));
    if (tmp > convQ64(1)) {
      return 0;
    } else {
      return uint24(deconvQ64(mulQ64((convQ64(1) - tmp) >> 1, convQ64(100000000))));
    }
  }

  /// @notice Calculates the no-slippage approximation of the dynamic fee relative to both Uniswap reference pools, assuming swap provides token 0 as input, and returns the lower of the two fees.
  function calculateBestDynamicFeeToken0In () private view returns (uint24) {
    uint24 fee30 = calculateDynamicFeeToken0In(getUniswapSqrtPrice30(), 300000);
    uint24 fee5 = calculateDynamicFeeToken0In(getUniswapSqrtPrice5(), 50000);
    if (fee5 < fee30) {
      return fee5;
    } else {
      return fee30;
    }
  }

  /// @notice Calculates the no-slippage approximation of the dynamic fee relative to both Uniswap reference pools, assuming swap provides token 1 as input, and returns the lower of the two fees.
  function calculateBestDynamicFeeToken1In () private view returns (uint24) {
    uint24 fee30 = calculateDynamicFeeToken1In(getUniswapSqrtPrice30(), 300000);
    uint24 fee5 = calculateDynamicFeeToken1In(getUniswapSqrtPrice5(), 50000);
    if (fee5 < fee30) {
      return fee5;
    } else {
      return fee30;
    }
  }

  /// @notice Calculates token quantity remaining after subtracting a given fee rate.
  /// @param tokenIn The quantity of token provided in the swap.
  /// @param fee The fee rate charged to the swap, in hundredths of basis points.
  function adjustTokenInForFee(uint128 tokenIn, uint128 fee) internal pure returns (uint128) {
    return ((100000000 - fee) * tokenIn) / 100000000;
  }

  /// @notice Calculates the new square-root price of the CrocSwap pool given an input quantity of token 0 and a fee rate, assuming active liquidity stays constant.
  /// @param tokenIn The quantity of token 0 provided in the swap.
  /// @param fee The fee rate charged to the swap, in hundredths of basis points.
  function estimateSqrtPriceToken0In (uint128 tokenIn, uint24 fee) private view returns (uint128) {
    tokenIn = adjustTokenInForFee(tokenIn, fee);
    uint128 invSqrtPrice = divQ64(convQ64(1), getPoolSqrtPrice());
    uint128 deltaInvSqrtPrice = divQ64(convQ64(tokenIn), convQ64(CurveMath.activeLiquidity(curve)));
    uint128 newInvSqrtPrice = invSqrtPrice + deltaInvSqrtPrice;
    return divQ64(convQ64(1), newInvSqrtPrice);
  }

  /// @notice Calculates the new square-root price of the CrocSwap pool given an input quantity of token 1 and a fee rate, assuming active liquidity stays constant.
  /// @param tokenIn The quantity of token 1 provided by the swap.
  /// @param fee The fee rate charged to the swap, in hundredths of basis points.
  function estimateSqrtPriceToken1In (uint128 tokenIn, uint24 fee) private view returns (uint128) {
    tokenIn = adjustTokenInForFee(tokenIn, fee);
    uint128 deltaSqrtPrice = divQ64(convQ64(tokenIn), convQ64(CurveMath.activeLiquidity(curve)));
    return getPoolSqrtPrice() + deltaSqrtPrice;
  }

  /// @notice Given two square-rooted fixed-point Q64.64 prices, returns the absolute difference in hundredths of basis points relative to the first number.
  /// @param a The reference price relative to which the price difference is calculated, in square-root Q64.64 fixed-point format.
  /// @param b The price which is compared to the reference price, in square-root Q64.64 fixed-point format.
  function calculateSqrtPriceDifference (uint128 a, uint128 b) internal pure returns (uint24) {
    a = mulQ64(a, a);
    b = mulQ64(b, b);
    return uint24(deconvQ64(mulQ64(divQ64(b > a ? b - a : a - b, a), convQ64(100000000))));
  }

  /// @notice Calculates absolute slippage in hundredths of basis points given an input quantity of token 0 and a fee rate, assuming active liquidity stays constant.
  /// @param tokenIn The quantity of token 0 provided by the swap.
  /// @param fee The fee rate charged to the swap, in hundredths of basis points.
  function estimateSlippageToken0In (uint128 tokenIn, uint24 fee) private view returns (uint24) {
    uint128 newSqrtPrice = estimateSqrtPriceToken0In(tokenIn, fee);
    return calculateSqrtPriceDifference(getPoolSqrtPrice(), newSqrtPrice);
  }

  /// @notice Calculates absolute slippage in hundredths of basis points given an input quantity of token 1 and a fee rate, assuming active liquidity stays constant.
  /// @param tokenIn The quantity of token 1 provided by the swap.
  /// @param fee The fee rate charged to the swap, in hundredths of basis points.
  function estimateSlippageToken1In (uint128 tokenIn, uint24 fee) private view returns (uint24) {
    uint128 newSqrtPrice = estimateSqrtPriceToken1In(tokenIn, fee);
    return calculateSqrtPriceDifference(getPoolSqrtPrice(), newSqrtPrice);
  }

  /// @notice Calculates the signed difference of the CrocSwap pool price relative to the Uniswap 30bp pool price in hundredths of basis points.
  function calculatePriceDiffUniswap30 () private view returns (int24 priceDiff) {
    priceDiff = int24(calculateSqrtPriceDifference(getPoolSqrtPrice(), getUniswapSqrtPrice30()));
    if (getUniswapSqrtPrice30() > getPoolSqrtPrice()) {
      priceDiff = -priceDiff;
    }
  }

  /// @notice Fully calculates the dynamic, per-swap fee with a multi-step process given a specific quantity of token inflow.
  /// @param token0 A boolean which is true if the token provided to the pool by the swap is token 0 in the pool's pair.
  /// @param tokenIn The quantity of token provided to the CrocSwap pool in a swap.
  function calculateDynamicFee (bool token0, uint128 tokenIn) private view returns (uint24 fee) {
    // Calculate a no-slippage approximation of the optimal fee
    fee = token0 ? calculateBestDynamicFeeToken0In() : calculateBestDynamicFeeToken1In();

    // Calculate the slippage of executing the entire trade in the CrocSwap pool
    uint24 slippage = token0 ? estimateSlippageToken0In(tokenIn, fee) : estimateSlippageToken1In(tokenIn, fee);

    // Calculate the signed difference of the CrocSwap pool's price minus the Uniswap 30bp pool's price
    int24 priceDiff = calculatePriceDiffUniswap30();

    // Adjust the slippage by adding or subtracting the price difference between pools
    int24 slippage_ = int24(slippage) + priceDiff;
    slippage = slippage_ < 0 ? uint24(0) : uint24(slippage_);

    // If slippage is higher than fee, use slippage as fee
    fee = slippage > fee ? slippage : fee;

    // Restrict fee to minimum and maximum values
    fee = fee < feeMin ? feeMin : fee;
    fee = fee > feeMax ? feeMax : fee;
  }
}