// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../libraries/TickCensus.sol";

contract TestTickCensus {
    using TickCensusLib for TickCensusLib.TickCensus;
    
    TickCensusLib.TickCensus private census;
    bytes32 constant poolIdx = bytes32(uint256(1986));
    
    function getBitmaps (int24 tick) public view returns
        (uint256 mezz, uint256 term) {
        mezz = census.mezzanineBitmap(poolIdx, tick);
        term = census.terminusBitmap(poolIdx, tick);
    }

    function testPinBuy (int24 tick, uint256 bitmap) public pure
        returns (int24, bool) {
        return TickCensusLib.pinBitmap(true, tick, bitmap);
    }

    function testPinSell (int24 tick, uint256 bitmap) public pure
        returns (int24, bool) {
        return TickCensusLib.pinBitmap(false, tick, bitmap);
    }

    function testSeekBuy (int24 tick) public view returns (int24, uint256) {
        int24 next = census.seekMezzSpill(poolIdx, tick, true);
        return (next, census.terminusBitmap(poolIdx, next));
    }

    function testSeekSell (int24 tick) public view returns (int24, uint256) {
        int24 next = census.seekMezzSpill(poolIdx, tick, false);
        return (next, census.terminusBitmap(poolIdx, next));
    }

    function testBookmark (int24 tick) public {
        census.bookmarkTick(poolIdx, tick);
    }

    function testForget (int24 tick) public {
        census.forgetTick(poolIdx, tick);
    }
}
