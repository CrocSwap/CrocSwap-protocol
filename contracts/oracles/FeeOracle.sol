// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/TickMath.sol';
import '../libraries/CurveMath.sol';
import '../lens/CrocQuery.sol';

import "hardhat/console.sol";

interface UniswapV3Pool {
  function slot0 () external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked);
}

contract FeeOracle {
  uint24 immutable feeMin;
  uint24 immutable feeMax;
  CrocQuery immutable query;
  address immutable base;
  address immutable quote;
  uint256 immutable poolIdx;
  UniswapV3Pool immutable uniswapPool30;
  UniswapV3Pool immutable uniswapPool5;

  /// @param _feeMin The minimum swap fee to return, in hundredths of basis points.
  /// @param _feeMax The maximum swap fee to return, in hundredths of basis points.
  /// @param _dex The address of the CrocSwap DEX.
  /// @param _base Token address of the base (1st) token.
  /// @param _quote Token address of the quote (2nd) token.
  /// @param _poolIdx Numerical index of the CrocSwap pool.
  /// @param _uniswapPool30 Address of the Uniswap 30 basis point fee reference pool.
  /// @param _uniswapPool5 Address of the Uniswap 5 basis point fee reference pool.
  constructor (uint24 _feeMin, uint24 _feeMax, address _dex, address _base, address _quote, uint256 _poolIdx, address _uniswapPool30, address _uniswapPool5) {
    feeMin = _feeMin;
    feeMax = _feeMax;
    query = CrocQuery(_dex);
    base = _base;
    quote = _quote;
    poolIdx = _poolIdx;
    uniswapPool30 = UniswapV3Pool(_uniswapPool30);
    uniswapPool5 = UniswapV3Pool(_uniswapPool5);
  }

  /// @notice Converts an integer into a Q64.64 fixed point representation.
  /// @param x A 64-bit unsigned integer to convert into Q64.64 format.
  function convQ64 (uint128 x) public pure returns (uint128) {
    return x << 64;
  }

  /// @notice Converts a Q64.64 fixed point number into an integer by discarding all decimals.
  /// @param x A Q64.64 fixed point number to convert into a 64-bit integer
  function deconvQ64 (uint128 x) public pure returns (uint128) {
    return x >> 64;
  }

  /// @notice Multiplies two Q64.64 fixed point numbers together, returning a Q128.128 number.
  /// @param a A Q64.64 fixed point number
  /// @param b A Q64.64 fixed point number
  function mulQ64 (uint128 a, uint128 b) public pure returns (uint256) {
    return uint256(a) * uint256(b);
  }

  /// @notice Converts a Q128.128 number into a Q64.64 number, dropping the most and least significant digits
  /// @param x A Q128.128 fixed point number
  function convQ128toQ64 (uint256 x) public pure returns (uint128) {
    return uint128(x >> 64);
  }

  /// @notice Divides one Q64.64 fixed point number by another Q64.64 number.
  /// @param a A Q64.64 fixed point number (the numerator)
  /// @param b A Q64.64 fixed point number (the denominator)
  function divQ64 (uint128 a, uint128 b) public pure returns (uint128) {
    uint256 a_ = uint256(a);
    a_ = a_ << 64;
    return uint128(a_ / b);
  }

  /// @notice Returns the square root price (in Q64.64 fixed-point format) and the current tick of a UniswapV3Pool contract.
  /// @param pool The UniswapV3Pool to query for data.
  function getUniswapSqrtPriceAndTick (UniswapV3Pool pool) public view returns (uint128 priceSqrt, int24 tick) {
    uint160 priceSqrt_;
    (priceSqrt_, tick, , , , ,) = pool.slot0();
    priceSqrt = uint128(priceSqrt_ >> 32);
  }

  /// @notice Calculates the no-slippage approximation of the dynamic fee relative to both the 30 and 5 basis point fee Uniswap reference pools, assuming swap provides token 0 as input, and returns the lower of the two fees.
  /// @param tick Current tick of the CrocSwap pool.
  /// @param tick30 Current tick of the Uniswap 30 basis point reference pool.
  /// @param tick5 Current tick of the Uniswap 5 basis point reference pool.
  function calculateDynamicFeeToken0In (int24 tick, int24 tick30, int24 tick5) public pure returns (int24) {
    int24 fee30 = (tick - tick30 + 30) * 100;
    int24 fee5 = (tick - tick5 + 5) * 100;
    return fee5 < fee30 ? fee5 : fee30;
  }

  /// @notice Calculates the no-slippage approximation of the dynamic fee relative to both the 30 and 5 basis point fee Uniswap reference pools, assuming swap provides token 1 as input, and returns the lower of the two fees.
  /// @param tick Current tick of the CrocSwap pool.
  /// @param tick30 Current tick of the Uniswap 30 basis point reference pool.
  /// @param tick5 Current tick of the Uniswap 5 basis point reference pool.
  function calculateDynamicFeeToken1In (int24 tick, int24 tick30, int24 tick5) public pure returns (int24) {
    int24 fee30 = (tick30 - tick + 30) * 100;
    int24 fee5 = (tick5 - tick + 5) * 100;
    return fee5 < fee30 ? fee5 : fee30;
  }

  /// @notice Calculates token quantity remaining after subtracting a given fee rate.
  /// @param tokenIn The quantity of token provided in the swap.
  /// @param fee The fee rate charged to the swap, in hundredths of basis points.
  function adjustTokenInForFee(uint128 tokenIn, uint128 fee) public pure returns (uint128) {
    return ((1000000 - fee) * tokenIn) / 1000000;
  }

  /// @notice Calculates the new square-root price of the CrocSwap pool given an input quantity of token 0 and a fee rate, assuming active liquidity stays constant.
  /// @param tokenIn The quantity of token 0 provided in the swap.
  /// @param poolSqrtPrice The square rooted price of the CrocSwap pool, in Q64.64 fixed-point format.
  /// @param poolLiquidity The amount of active liquidity in the pool.
  /// @param fee The fee rate charged to the swap, in hundredths of basis points.
  function estimateSqrtPriceToken0In (uint128 tokenIn, uint128 poolSqrtPrice, uint128 poolLiquidity, uint24 fee) public pure returns (uint128) {
    tokenIn = adjustTokenInForFee(tokenIn, fee);
    return divQ64(convQ64(1), divQ64(convQ64(1), poolSqrtPrice) + divQ64(convQ64(tokenIn), convQ64(poolLiquidity)));
  }

  /// @notice Calculates the new square-root price of the CrocSwap pool given an input quantity of token 1 and a fee rate, assuming active liquidity stays constant.
  /// @param tokenIn The quantity of token 1 provided by the swap.
  /// @param poolSqrtPrice The square rooted price of the CrocSwap pool, in Q64.64 fixed-point format.
  /// @param poolLiquidity The amount of active liquidity in the pool.
  /// @param fee The fee rate charged to the swap, in hundredths of basis points.
  function estimateSqrtPriceToken1In (uint128 tokenIn, uint128 poolSqrtPrice, uint128 poolLiquidity, uint24 fee) public pure returns (uint128) {
    tokenIn = adjustTokenInForFee(tokenIn, fee);
    return poolSqrtPrice + divQ64(convQ64(tokenIn), convQ64(poolLiquidity));
  }

  /// @notice Given two square-rooted fixed-point Q64.64 prices, returns the absolute difference in hundredths of basis points relative to the first number.
  /// @param a The reference price relative to which the price difference is calculated, in square-root Q64.64 fixed-point format.
  /// @param b The price which is compared to the reference price, in square-root Q64.64 fixed-point format.
  function calculateSqrtPriceDifference (uint128 a, uint128 b) public pure returns (uint24) {
    uint256 aSq = mulQ64(a, a);
    uint256 bSq = mulQ64(b, b);
    uint128 diff = divQ64(uint128((bSq > aSq ? bSq - aSq : aSq - bSq) >> 64), uint128(aSq >> 64));
    return uint24(deconvQ64(convQ128toQ64(mulQ64(diff, convQ64(1000000)))));
  }

  /// @notice Given two price ticks, estimates the signed difference of the second price relative to the first price by simply taking the difference in tick space. The difference is given in hundredths of basis points.
  /// @param tick0 The reference tick relative to which the price difference is estimated.
  /// @param tick1 The price tick which is compared to the reference tick.
  function estimatePriceDifferenceWithTicks (int24 tick0, int24 tick1) public pure returns (int24) {
    return (tick1 - tick0) * 100;
  }

  /// @notice Calculates absolute slippage in hundredths of basis points given an input quantity of token 0 and a fee rate, assuming active liquidity stays constant.
  /// @param tokenIn The quantity of token 0 provided by the swap.
  /// @param poolSqrtPrice The square rooted price of the pool, in Q64.64 fixed-point format.
  /// @param poolLiquidity The amount of active liquidity in the pool.
  /// @param fee The fee rate charged to the swap, in hundredths of basis points.
  function estimateSlippageToken0In (uint128 tokenIn, uint128 poolSqrtPrice, uint128 poolLiquidity, uint24 fee) public pure returns (uint24) {
    return calculateSqrtPriceDifference(poolSqrtPrice, estimateSqrtPriceToken0In(tokenIn, poolSqrtPrice, poolLiquidity, fee));
  }

  /// @notice Calculates absolute slippage in hundredths of basis points given an input quantity of token 1 and a fee rate, assuming active liquidity stays constant.
  /// @param tokenIn The quantity of token 1 provided by the swap.
  /// @param poolSqrtPrice The square rooted price of the pool, in Q64.64 fixed-point format.
  /// @param poolLiquidity The amount of active liquidity in the pool.
  /// @param fee The fee rate charged to the swap, in hundredths of basis points.
  function estimateSlippageToken1In (uint128 tokenIn, uint128 poolSqrtPrice, uint128 poolLiquidity, uint24 fee) public pure returns (uint24) {
    return calculateSqrtPriceDifference(poolSqrtPrice, estimateSqrtPriceToken1In(tokenIn, poolSqrtPrice, poolLiquidity, fee));
  }

  /// @notice Fully calculates the dynamic, per-swap fee with a multi-step process given a specific quantity of token inflow.
  /// @param token0 A boolean which is true if the token provided to the pool by the swap is token 0 in the pool's pair.
  /// @param tokenIn The quantity of token provided to the CrocSwap pool in a swap.
  function calculateDynamicFee (bool token0, uint128 tokenIn) public view returns (uint24 fee) {
    // Retrieve data about the CrocSwap pool curve
    CurveMath.CurveState memory curve = query.queryCurve(base, quote, poolIdx);

    // Precompute the ticks square-rooted Q64.64 prices of the two Uniswap reference pools and the CrocSwap pool under consideration
    uint128 uniswapSqrtPrice30;
    uint128 uniswapSqrtPrice5;
    int24 uniswapTick30;
    int24 uniswapTick5;
    (uniswapSqrtPrice30, uniswapTick30) = getUniswapSqrtPriceAndTick(uniswapPool30);
    (uniswapSqrtPrice5, uniswapTick5) = getUniswapSqrtPriceAndTick(uniswapPool5);
    uint128 poolSqrtPrice = curve.priceRoot_;
    uint128 poolLiquidity = CurveMath.activeLiquidity(curve);
    int24 poolTick = TickMath.getTickAtSqrtRatio(poolSqrtPrice);

    // Calculate a no-slippage approximation of the optimal fee
    int24 fee_ = token0 ? calculateDynamicFeeToken0In(poolTick, uniswapTick30, uniswapTick5) : calculateDynamicFeeToken1In(poolTick, uniswapTick30, uniswapTick5);

    // Calculate the slippage of executing the entire trade in the CrocSwap pool
    uint24 slippage = token0 ? estimateSlippageToken0In(tokenIn, poolSqrtPrice, poolLiquidity,  fee) : estimateSlippageToken1In(tokenIn, poolSqrtPrice, poolLiquidity, fee);

    // Calculate the signed difference of the CrocSwap pool's price minus the Uniswap 30bp pool's price
    int24 priceDiff = estimatePriceDifferenceWithTicks(uniswapTick30, poolTick);
    priceDiff = token0 ? priceDiff : -priceDiff;

    // Adjust the slippage by adding the signed price difference between pools
    int24 slippage_ = int24(slippage) + priceDiff;
    slippage = slippage_ < 0 ? 0 : uint24(slippage_);

    // Convert fee to unsigned integer, using feeMin if below minimum
    fee = fee_ < int24(feeMin) ? feeMin : fee;

    // If slippage is higher than fee, use slippage as fee
    fee = slippage > fee ? slippage : fee;

    // Restrict fee to maximum value
    fee = fee > feeMax ? feeMax : fee;
  }
}