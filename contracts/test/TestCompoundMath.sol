// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../libraries/CompoundMath.sol";

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

    function testDivide (uint256 x, uint256 y) public pure returns (uint64) {
        return x.compoundDivide(y);
    }

    function testPrice (uint160 price, uint64 growth, bool up)
        public pure returns (uint256) {
        return price.compoundPrice(growth, up);
    }

    function testInflate (uint128 x, uint64 y) public pure returns (uint128) {
        return x.inflateLiqSeed(y);
    }
}
