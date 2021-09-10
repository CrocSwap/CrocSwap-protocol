// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../mixins/TickCensus.sol";

contract TestTickCensus is TickCensus {

    function getBitmaps (int24 tick) public view returns
        (uint256 lobby, uint256 mezz, uint256 term) {
        lobby = lobbyBitmap();
        mezz = mezzanineBitmap(tick);
        term = terminusBitmap(tick);
    }

    function testPinBuy (int24 tick, uint256 bitmap) public pure
        returns (int24, bool) {
        return pinBitmap(true, tick, bitmap);
    }

    function testPinSell (int24 tick, uint256 bitmap) public pure
        returns (int24, bool) {
        return pinBitmap(false, tick, bitmap);
    }

    function testSeekBuy (int24 tick) public view returns (int24, uint256) {
        int24 next = seekMezzSpill(tick, true);
        return (next, terminusBitmap(next));
    }

    function testSeekSell (int24 tick) public view returns (int24, uint256) {
        int24 next = seekMezzSpill(tick, false);
        return (next, terminusBitmap(next));
    }

    function testBookmark (int24 tick) public {
        bookmarkTick(tick);
    }

    function testForget (int24 tick) public {
        forgetTick(tick);
    }
}
