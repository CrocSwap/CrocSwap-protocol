
// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.8.4;
    
import "../mixins/PositionRegistrar.sol";

contract TestPositionRegistrar is PositionRegistrar {
    uint256 public lastRewards;
    
    function testAdd (address owner, uint256 poolIdx, int24 lower, int24 upper,
                      uint128 liq, uint64 mileage) public {
        mintPosLiq(owner, bytes32(poolIdx), lower, upper, liq, mileage);
    }

    function testBurn (address owner, uint256 poolIdx, int24 lower, int24 upper,
                       uint128 liq, uint64 mileage) public {
        lastRewards = burnPosLiq(owner, bytes32(poolIdx), lower, upper, liq, mileage);
    }

    function testTransfer (address owner, address receipient, uint256 poolIdx,
                           int24 lower, int24 upper) public {
        changePosOwner(owner, receipient, bytes32(poolIdx), lower, upper);
    }

    function getPos (address owner, uint256 poolIdx, int24 lower, int24 upper)
        public view returns (uint128, uint256) {
        Position storage pos = lookupPosition(owner, bytes32(poolIdx), lower, upper);
        return (pos.liquidity_, pos.feeMileage_);
    }
}
