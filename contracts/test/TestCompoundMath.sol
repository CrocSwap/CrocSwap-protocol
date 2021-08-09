// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../libraries/CompoundMath.sol";

contract TestCompoundMath {
    using CompoundMath for uint256;
    
    function testSqrt (uint256 x) public pure returns (uint256) {
        return x.approxSqrtCompound();
    }

    function testAdd (uint256 x, uint256 y) public pure returns (uint256) {
        return x.compoundAdd(y);
    }

    function testShrink (uint256 x, uint256 y) public pure returns (uint256) {
        return x.compoundShrink(y);
    }
}
