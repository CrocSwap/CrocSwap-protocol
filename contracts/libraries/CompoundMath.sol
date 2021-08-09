// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;

import "./FixedPoint128.sol";
import "./FullMath.sol";
import "./LowGasSafeMath.sol";
    
library CompoundMath {
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    
    function approxSqrtCompound (uint256 x) internal pure returns (uint256) {
        // Taylor series error becomes too large above 2.0. Approx is still conservative
        // but the angel's share becomes unreasonble. 
        require(x < FixedPoint128.Q128, "C");
        
        uint256 linear = x/2;
        uint256 ONE = FixedPoint128.Q128;
        uint256 quad = FullMath.mulDiv(x, x, ONE) / 8;
        return linear - quad;
    }
    
    
    function compoundAdd (uint256 base, uint256 inflator) internal pure returns (uint256) {
        uint256 ONE = FixedPoint128.Q128;
        return FullMath.mulDiv(ONE.add(base), ONE.add(inflator), ONE).sub(ONE);
    }

    function compoundDivide (uint256 next, uint256 start) internal pure returns (uint256) {
        uint256 ONE = FixedPoint128.Q128;
        return FullMath.mulDiv(next, ONE, start).sub(ONE);
    }

    function compoundGrow (uint256 scale, uint256 deflator)
        internal pure returns (uint256) {
        uint256 ONE = FixedPoint128.Q128;
        return FullMath.mulDiv(scale, ONE.add(deflator), ONE);
    }

    function compoundShrink (uint256 scale, uint256 deflator)
        internal pure returns (uint256) {
        uint256 ONE = FixedPoint128.Q128;
        return FullMath.mulDiv(scale, ONE, ONE.add(deflator));
    }
    
}
