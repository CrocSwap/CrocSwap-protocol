// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;

import "../mixins/LevelBook.sol";

contract TestLevelBook is LevelBook {
    using TickMath for uint160;

    int256 public liqDelta;
    uint256 public odometer;
    
    function getLevelState (int24 tick) public view returns (BookLevel memory) {
        return levelState(tick);
    }

    function pullFeeOdometer (int24 mid, int24 bid, int24 ask, uint256 feeGlobal)
        public view returns (uint256) {
        return clockFeeOdometer(mid, bid, ask, feeGlobal);
    }

    function testCrossLevel (int24 tick, bool isBuy, uint256 feeGlobal) public {
        liqDelta = crossLevel(tick, isBuy, feeGlobal);
    }

    function testAdd (int24 midTick, int24 bidTick, int24 askTick, uint128 liq,
                      uint256 globalFee) public {
        odometer = addBookLiq(midTick, bidTick, askTick, liq, globalFee);
    }

    function testRemove (int24 midTick, int24 bidTick, int24 askTick, uint128 liq,
                      uint256 globalFee) public {
        odometer = removeBookLiq(midTick, bidTick, askTick, liq, globalFee);
    }

    function testSetTickSize (int24 tick) public {
        setTickSize(tick);
    }

    function testGetTickSize() public view returns (uint16) {
        return getTickSize();
    }

    function hasTickBump (int24 tick) public view returns (bool) {
        return hasTickBookmark(tick);
    }

}
