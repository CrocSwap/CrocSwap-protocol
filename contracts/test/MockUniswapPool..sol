// SPDX-License-Identifier: Unlicensed

import '../oracles/FeeOracle.sol';

pragma solidity >=0.8.4;

contract MockUniswapPool is UniswapV3Pool {
  uint160 priceSqrt;
  int24 tick;

  constructor () {
  }

  function setPriceSqrt(uint160 _priceSqrt) public {
    priceSqrt = _priceSqrt;
  }

  function setTick(int24 _tick) public {
    tick = _tick;
  }

  function slot0 () public view override returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
    return (priceSqrt, tick, 0, 0, 0, 0, true);
  }
}