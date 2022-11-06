// SPDX-License-Identifier: GPL-3
pragma solidity ^0.8.4;
    
import "../libraries/CompoundMath.sol";

import "hardhat/console.sol";

contract TestCompoundMath {
    using CompoundMath for uint256;
    using CompoundMath for uint160;
    using CompoundMath for uint128;
    using CompoundMath for uint64;
    
    function testSqrt (uint64 x) public pure returns (uint64) {
        return x.approxSqrtCompound();
    }

    function testStack (uint64 x, uint64 y) public pure returns (uint64) {
        return x.compoundStack(y);
    }

    function testDivide (uint128 x, uint128 y) public pure returns (uint64) {
        return x.compoundDivide(y);
    }

    function testShrink (uint64 x, uint64 y) public pure returns (uint256) {
        return x.compoundShrink(y);
    }

    function testPrice (uint128 price, uint64 growth, bool up)
        public pure returns (uint256) {
        return price.compoundPrice(growth, up);
    }

    function testInflate (uint128 x, uint64 y) public pure returns (uint128) {
        return x.inflateLiqSeed(y);
    }

    function testDeflate (uint128 x, uint64 y) public pure returns (uint128) {
        return x.deflateLiqSeed(y);
    }

    function testMulQ64 (uint128 x, uint128 y) public pure returns (uint192) {
        return FixedPoint.mulQ64(x, y);
    }

    function testMulQ48 (uint128 x, uint64 y) public pure returns (uint144) {
        return FixedPoint.mulQ48(x, y);
    }

    function testDivQ64 (uint128 x, uint128 y) public pure returns (uint256) {
        return FixedPoint.divQ64(x, y);
    }

    function testDivQ64Sq (uint128 x, uint128 y) public pure returns (uint256) {
        return FixedPoint.divSqQ64(x, y);
    }

    function testRecipQ64 (uint128 x) public pure returns (uint128) {
        return FixedPoint.recipQ64(x);
    }
}
