// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "./Directives.sol";

/* @title Order encoding library */
library OrderEncoding {

    function decodeOrder (bytes calldata input) internal pure returns
        (Directives.OrderDirective memory) {
        uint32 offset = 0;
        uint8 tokenCnt;
        (tokenCnt, offset) = eatUInt8(input, offset);

        address tokenX;
        address tokenY;
        (tokenX, offset) = eatToken(input, offset);
        
        Directives.SettlementChannel memory settle;
        (settle, offset) = parseSettle(input, offset);
        Directives.SettlementChannel memory openSettle = settle;

        Directives.PairDirective memory pair;
        Directives.HopDirective[] memory hops = new Directives.HopDirective[](tokenCnt);
        
        for (uint i = 0; i < tokenCnt; ++i) {
            (tokenY, offset) = eatToken(input, offset);
            (pair, offset) = parsePair(tokenX, tokenY, input, offset);
            (settle, offset) = parseSettle(input, offset);
            
            hops[i] = Directives.HopDirective({pair_: pair, settle_: settle});
            tokenX = tokenY;
        }

        (settle, offset) = parseSettle(input, offset);
        return Directives.OrderDirective({open_: openSettle, hops_: hops,
                    close_: settle});
    }

    
    function parsePair (address tokenX, address tokenY, bytes calldata input,
                        uint32 offset)
        private pure returns (Directives.PairDirective memory pair, uint32 next) {
        uint8 poolCnt;
        (poolCnt, next) = eatUInt8(input, offset);

        Directives.PoolDirective[] memory pools =
            new Directives.PoolDirective[](poolCnt);
                
        for (uint i = 0; i < poolCnt; ++i) {
            (pools[i], next) = parsePool(input, next);
        }
        pair = Directives.PairDirective({tokenX_: tokenX, tokenY_: tokenY,
                    pools_: pools});
    }

    function parsePool (bytes calldata input, uint32 offset)
        private pure returns (Directives.PoolDirective memory pair, uint32 next) {
        uint24 poolIdx;
        Directives.PassiveDirective memory passive;
        Directives.SwapDirective memory swap;
        Directives.PassiveDirective memory passivePost;
        
        (poolIdx, next) = eatUInt24(input, offset);
        (passive, next) = parsePassive(input, next);
        (swap, next) = parseSwap(input, next);
        (passivePost, next) = parsePassive(input, next);
        
        pair = Directives.PoolDirective({poolIdx_: poolIdx, passive_: passive,
                    swap_: swap, passivePost_: passivePost});
    }

    function parsePassive (bytes calldata input, uint32 offset)
        private pure returns (Directives.PassiveDirective memory pass, uint32 next) {
        int128 ambientLiq;
        int128 concenLiq;
        uint24 openTick;
        uint24 closeTick;
        uint8 bookendCnt;

        (ambientLiq, next) = eatInt128(input, offset);
        (openTick, next) = eatUInt24(input, next);
        (bookendCnt, next) = eatUInt8(input, next);

        Directives.ConcenBookend[] memory bookends =
            new Directives.ConcenBookend[](bookendCnt);

        for (uint8 i = 0; i < bookendCnt; ++i) {
            (closeTick, next) = eatUInt24(input, next);
            (concenLiq, next) = eatInt128(input, next);
            bookends[i] = Directives.ConcenBookend({closeTick_: closeTick,
                        liquidity_: concenLiq});
        }

        pass = Directives.PassiveDirective(
            {ambient_: Directives.AmbientDirective(ambientLiq),
                    conc_: Directives.ConcentratedDirective({openTick_: openTick,
                                bookends_: bookends})});
    }

    function parseSwap (bytes calldata input, uint32 offset)
        private pure returns (Directives.SwapDirective memory swap, uint32 next) {
        uint8 liqMask;
        uint8 dirFlags;
        uint128 qty;
        uint128 limitPrice;

        (liqMask, next) = eatUInt8(input, offset);
        (dirFlags, next) = eatUInt8(input, next);
        (qty, next) = eatUInt128(input, next);
        (limitPrice, next) = eatUInt128(input, next);

        bool isBuy = (dirFlags & 0x2) > 0;
        bool quoteToBase = (dirFlags & 0x1) > 0;
        swap = Directives.SwapDirective({liqMask_: liqMask, isBuy_: isBuy,
                    quoteToBase_: quoteToBase, qty_: qty, limitPrice_: limitPrice});
    }

    function parseSettle (bytes calldata input, uint32 offset)
        private pure returns (Directives.SettlementChannel memory settle, uint32 next) {
        int128 limitQty;
        uint128 dustThresh;
        uint8 reservesFlag;

        (limitQty, next) = eatInt128(input, offset);
        (dustThresh, next) = eatUInt128(input, next);
        (reservesFlag, next) = eatUInt8(input, next);

        settle = Directives.SettlementChannel({limitQty_: limitQty,
                    dustThresh_: dustThresh, useReserves_: reservesFlag > 0});
    }

    function eatUInt8 (bytes calldata input, uint32 offset)
        internal pure returns (uint8 cnt, uint32 next) {
        cnt = uint8(input[offset]);
        next = offset + 1;
    }

    function eatUInt24 (bytes calldata input, uint32 offset)
        internal pure returns (uint24 val, uint32 next) {
        bytes3 coded = input[offset] |
            (bytes3(input[offset+1]) >> 8) |
            (bytes3(input[offset+2]) >> 16);
        val = uint24(coded);
        next = offset + 3;
    }

    function eatToken (bytes calldata input, uint32 offset)
        internal pure returns (address token, uint32 next) {
        token = abi.decode(input[offset:(offset+32)], (address));
        next = offset + 32;
    }

    function eatInt256 (bytes calldata input, uint32 offset)
        internal pure returns (int256 delta, uint32 next) {
        delta = abi.decode(input[offset:(offset+32)], (int256));
        next = offset + 32;
    }

    function eatInt128 (bytes calldata input, uint32 offset)
        internal pure returns (int128 delta, uint32 next) {
        delta = abi.decode(input[offset:(offset+32)], (int128));
        next = offset + 32;
    }

    function eatUInt128 (bytes calldata input, uint32 offset)
        internal pure returns (uint128 delta, uint32 next) {
        delta = abi.decode(input[offset:(offset+32)], (uint128));
        next = offset + 32;
    }
    
}
