// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../libraries/TickCensus.sol";

contract TestTickCensus {
    using TickCensusLib for TickCensusLib.TickCensus;
    
    TickCensusLib.TickCensus private census;
    
    function getBitmaps (int24 tick) public view returns
        (uint256 lobby, uint256 mezz, uint256 term) {
        lobby = census.lobby_;
        mezz = census.mezzanineBitmap(tick);
        term = census.terminusBitmap(tick);
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
        int24 next = census.seekMezzSpill(tick, true);
        return (next, census.terminusBitmap(next));
    }

    function testSeekSell (int24 tick) public view returns (int24, uint256) {
        int24 next = census.seekMezzSpill(tick, false);
        return (next, census.terminusBitmap(next));
    }

    function testBookmark (int24 tick) public {
        census.bookmarkTick(tick);
    }

    function testForget (int24 tick) public {
        census.forgetTick(tick);
    }
}
