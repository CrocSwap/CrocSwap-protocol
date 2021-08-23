// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../libraries/CompoundMath.sol";

contract TestCompoundMath {
    using CompoundMath for uint256;
    using CompoundMath for uint128;
    
    function testSqrt (uint256 x) public pure returns (uint256) {
        return x.approxSqrtCompound();
    }

    function testAdd (uint256 x, uint256 y) public pure returns (uint256) {
        return x.compoundAdd(y);
    }

    function testGrow (uint256 x, uint256 y) public pure returns (uint256) {
        return x.compoundGrow(y);
    }

    function testShrink (uint256 x, uint256 y) public pure returns (uint256) {
        return x.compoundShrink(y);
    }

    function testInflate (uint128 x, uint256 y) public pure returns (uint128) {
        return x.inflateLiqSeed(y);
    }
}
