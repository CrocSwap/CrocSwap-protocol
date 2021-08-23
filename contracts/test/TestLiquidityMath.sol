// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../libraries/LiquidityMath.sol";

contract TestLiquidityMath {
    using LiquidityMath for uint128;
    
    function testAddSigned (uint128 x, int128 y) public pure returns (uint128) {
        return x.addDelta(y);        
    }

    function testAddUnsigned (uint128 x, int128 y) public pure returns (uint128) {
        return x.addDelta(y);        
    }

    function testMinus (uint128 x, uint128 y) public pure returns (uint128) {
        return x.minusDelta(y);
    }
}
