
// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.8.4;
    
import "../mixins/PositionRegistrar.sol";

contract TestPositionRegistrar is PositionRegistrar {
    uint256 public lastRewards;
    
    function testAdd (address owner, uint256 poolIdx, int24 lower, int24 upper,
                      uint128 liq, uint64 mileage) public {
        mintPosLiq(routerPosKey(owner), bytes32(poolIdx),
                   lower, upper, liq, mileage);
    }

    function testBurn (address owner, uint256 poolIdx, int24 lower, int24 upper,
                       uint128 liq, uint64 mileage) public {
        lastRewards = burnPosLiq(routerPosKey(owner), bytes32(poolIdx),
                                 lower, upper, liq, mileage);
    }

    function testTransfer (address owner, address receipient, uint256 poolIdx,
                           int24 lower, int24 upper) public {
        changePosOwner(routerPosKey(owner), routerPosKey(receipient),
                       bytes32(poolIdx), lower, upper);
    }

    function getPos (address owner, uint256 poolIdx, int24 lower, int24 upper)
        public view returns (uint128, uint256) {
        RangePosition storage pos = lookupPosition(routerPosKey(owner),
                                                   bytes32(poolIdx), lower, upper);
        return (pos.liquidity_, pos.feeMileage_);
    }

    function routerPosKey (address owner) private pure returns (bytes32) {
        return bytes32(uint256(uint160(owner)));
    }
}
