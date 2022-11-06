// SPDX-License-Identifier: GPL-3
pragma solidity ^0.8.4;
    
import "../mixins/TickCensus.sol";

contract TestTickCensus is TickCensus {
        
    bytes32 constant poolIdx = bytes32(uint256(1986));
    
    function getBitmaps (int24 tick) public view returns
        (uint256 mezz, uint256 term) {
        mezz = mezzanineBitmap(poolIdx, tick);
        term = terminusBitmap(poolIdx, tick);
    }

    function testPinBuy (int24 tick) public
        view returns (int24, bool) {
        return pinBitmap(poolIdx, true, tick);
    }

    function testPinSell (int24 tick) public
        view returns (int24, bool) {
        return pinBitmap(poolIdx, false, tick);
    }

    function setTermBitmap (int24 tick, uint256 bitmap) public {
        int24 mezzBase = (tick >> 8) << 8;
        for (uint24 i = 0; i < 256; i++) {
            if (bitmap & (0x1 << i) != 0) {
                bookmarkTick(poolIdx, mezzBase + int24(i));
            }
        }        
    }

    function testSeekBuy (int24 tick) public view returns (int24, uint256) {
        int24 next = seekMezzSpill(poolIdx, tick, true);
        return (next, terminusBitmap(poolIdx, next));
    }

    function testSeekSell (int24 tick) public view returns (int24, uint256) {
        int24 next = seekMezzSpill(poolIdx, tick, false);
        return (next, terminusBitmap(poolIdx, next));
    }

    function testBookmark (int24 tick) public {
        bookmarkTick(poolIdx, tick);
    }

    function testForget (int24 tick) public {
        forgetTick(poolIdx, tick);
    }
}
