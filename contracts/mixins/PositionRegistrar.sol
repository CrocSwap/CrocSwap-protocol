// SPDX-License-Identifier: Unlicensed 

pragma solidity >0.7.1;

import '../libraries/FullMath.sol';
import '../libraries/FixedPoint128.sol';
import '../libraries/LiquidityMath.sol';
import '../libraries/LowGasSafeMath.sol';

contract PositionRegistrar {
    using LowGasSafeMath for uint256;
    
    struct Position {
        uint128 liquidity_;
        uint256 feeMileage_;
    }

    mapping(bytes32 => Position) private positions_;

    function encodePosKey (address owner, int24 lowerTick, int24 upperTick)
        public pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner, lowerTick, upperTick));
    }

    function lookupPosition (address owner, int24 lowerTick, int24 upperTick)
        internal view returns (Position storage) {
        return lookupPosKey(encodePosKey(owner, lowerTick, upperTick));
    }

    function lookupPosKey (bytes32 posKey)
        internal view returns (Position storage) {
        return positions_[posKey];
    }


    function burnPosLiq (address owner, int24 lowerTick, int24 upperTick,
                         uint128 burnLiq, uint256 feeMileage)
        internal returns (uint256 rewards) {
        Position storage pos = lookupPosition(owner, lowerTick, upperTick);
        uint128 liq = pos.liquidity_;
        uint256 oldMileage = pos.feeMileage_;
        uint128 nextLiq = LiquidityMath.minusDelta(liq, burnLiq);

        if (feeMileage > oldMileage) {
            rewards = feeMileage.sub(oldMileage);
            if (nextLiq > 0) {
                pos.feeMileage_ = feeMileage;
            }
        }
        pos.liquidity_ = nextLiq;
    }
    
    
    function addPosLiq (address owner, int24 lowerTick, int24 upperTick,
                        uint128 liqAdded, uint256 feeMileage) internal {
        Position storage pos = lookupPosition(owner, lowerTick, upperTick);
        uint128 liq = pos.liquidity_;
        uint256 oldMileage;

        if (liq > 0) {
            oldMileage = pos.feeMileage_;
        } else {
            oldMileage = 0;
        }

        if (feeMileage > oldMileage) {
            pos.feeMileage_ = feeMileage;
        }
        pos.liquidity_ = LiquidityMath.addDelta(liq, liqAdded);
    }
}
