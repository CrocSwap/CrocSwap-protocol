// SPDX-License-Identifier: GPL-3

pragma solidity ^0.8.4;
pragma experimental ABIEncoderV2;

import "../mixins/LevelBook.sol";

contract TestLevelBook is LevelBook {
    using TickMath for uint160;

    int256 public liqDelta;
    bool public knockoutFlag;
    uint256 public odometer;

    function getLevelState (uint256 poolIdx, int24 tick) public view returns
        (BookLevel memory) {
        return levelState(bytes32(poolIdx), tick);
    }

    function pullFeeOdometer (uint256 poolIdx, int24 mid, int24 bid, int24 ask,
                              uint64 feeGlobal)
        public view returns (uint64) {
        return clockFeeOdometer(bytes32(poolIdx), mid, bid, ask, feeGlobal);
    }

    function testCrossLevel (uint256 poolIdx, int24 tick, bool isBuy,
                             uint64 feeGlobal) public {
        (liqDelta, knockoutFlag) = crossLevel(bytes32(poolIdx), tick, isBuy, feeGlobal);
    }

    function testAdd (uint256 poolIdx, int24 midTick, int24 bidTick, int24 askTick,
                      uint96 lots, uint64 globalFee) public {
        odometer = addBookLiq(bytes32(poolIdx), midTick, bidTick, askTick,
                              lots, globalFee);
    }

    function testRemove (uint256 poolIdx, int24 midTick, int24 bidTick, int24 askTick,
                         uint96 lots, uint64 globalFee) public {
        odometer = removeBookLiq(bytes32(poolIdx), midTick, bidTick, askTick,
                                 lots, globalFee);
    }

    function hasTickBump (uint256 poolIdx, int24 tick) public view returns (bool) {
        return hasTickBookmark(bytes32(poolIdx), tick);
    }

}
