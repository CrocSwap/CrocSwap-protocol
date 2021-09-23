// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../libraries/TickMath.sol";

contract TestTickMath {
    using TickMath for int24;
    using TickMath for uint128;
    
    function testRatio (int24 tick) public pure returns (uint128) {
        return tick.getSqrtRatioAtTick();
    }

    function testTick (uint128 ratio) public pure returns (int24) {
        return ratio.getTickAtSqrtRatio();
    }

    function minTick() public pure returns (int24) {
        return TickMath.MIN_TICK;
    }

    function maxTick() public pure returns (int24) {
        return TickMath.MAX_TICK;
    }

    function minRatio() public pure returns (uint128) {
        return TickMath.MIN_SQRT_RATIO;
    }

    function maxRatio() public pure returns (uint128) {
        return TickMath.MAX_SQRT_RATIO;
    }
}
