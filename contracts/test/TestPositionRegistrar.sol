// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../mixins/PositionRegistrar.sol";

contract TestPositionRegistrar is PositionRegistrar {
    uint256 public lastRewards;
    
    function testAdd (address owner, int24 lower, int24 upper,
                      uint128 liq, uint256 mileage) public {
        addPosLiq(owner, lower, upper, liq, mileage);
    }

    function testBurn (address owner, int24 lower, int24 upper,
                       uint128 liq, uint256 mileage) public {
        lastRewards = burnPosLiq(owner, lower, upper, liq, mileage);
    }

    function testTransfer (address owner, address receipient,
                           int24 lower, int24 upper) public {
        changePosOwner(owner, receipient, lower, upper);
    }

    function getPos (address owner, int24 lower, int24 upper)
        public view returns (uint128, uint256) {
        Position storage pos = lookupPosition(owner, lower, upper);
        return (pos.liquidity_, pos.feeMileage_);
    }
    function testGetItmdLiqRat () public view returns (uint128) {
        return getItmdLiqRat();
    }
    function testSetItmdLiqRat (uint128 itdmLiqRat) public {
        setItmdLiqRat(itdmLiqRat);
    }
    function testGetIntermediateTickLiqThreshold () public view returns (uint256) {
        return getIntermediateTickLiqThreshold();
    }
    function testValidItmdTickPos (address owner, int24 lowerTick, int24 upperTick, uint128 deltaLiq, bool burn) public view returns (bool, uint128) {
        return validItmdTickPos(owner, lowerTick, upperTick, deltaLiq, burn);
    }
}
