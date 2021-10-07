// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "./Directives.sol";

import "hardhat/console.sol";

/* @title Order encoding library */
library OrderEncoding {

    function decodeOrder (bytes calldata input) internal pure returns
        (Directives.OrderDirective memory) {
        uint32 offset = 0;
        uint8 hopCnt;

        Directives.SettlementChannel memory settle;
        (settle, offset) = parseSettle(input, offset);

        (hopCnt, offset) = eatUInt8(input, offset);
        Directives.HopDirective[] memory hops = new Directives.HopDirective[](hopCnt);
        Directives.HopDirective memory hop;
        
        for (uint i = 0; i < hopCnt; ++i) {
            (hop, offset) = parseHop(input, offset);
            hops[i] = hop;
        }

        return Directives.OrderDirective({open_: settle, hops_: hops });
    }
    
    function parseHop (bytes calldata input, uint32 offset)
        private pure returns (Directives.HopDirective memory hop, uint32 next) {
        uint8 poolCnt;
        (poolCnt, next) = eatUInt8(input, offset);

        Directives.PoolDirective[] memory pools =
            new Directives.PoolDirective[](poolCnt);
        for (uint i = 0; i < poolCnt; ++i) {
            (pools[i], next) = parsePool(input, next);
        }
        
        Directives.SettlementChannel memory settle;
        (settle, next) = parseSettle(input, next);

        Directives.PriceImproveReq memory improve;
        (improve, next) = parseImprove(input, next);
        
        hop = Directives.HopDirective({pools_: pools, settle_: settle,
                    improve_: improve});
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
        uint8 concCnt;

        (ambientLiq, next) = eatInt128(input, offset);
        (concCnt, next) = eatUInt8(input, next);

        Directives.ConcentratedDirective[] memory concs =
            new Directives.ConcentratedDirective[](concCnt);

        for (uint8 i = 0; i < concCnt; ++i) {
            Directives.ConcentratedDirective memory elem;
            (elem, next) = parseConcentrated(input, next);
            concs[i] = elem;
        }

        pass = Directives.PassiveDirective(
            {ambient_: Directives.AmbientDirective(ambientLiq), conc_: concs});
    }

    function parseConcentrated (bytes calldata input, uint32 offset)
        private pure returns (Directives.ConcentratedDirective memory pass,
                              uint32 next) {
        uint8 bookendCnt;
        int128 concenLiq;
        int24 openTick;
        int24 closeTick;
        
        (openTick, next) = eatInt24(input, offset);
        (bookendCnt, next) = eatUInt8(input, next);

        Directives.ConcenBookend[] memory bookends =
            new Directives.ConcenBookend[](bookendCnt);
            
        for (uint8 i = 0; i < bookendCnt; ++i) {
            (closeTick, next) = eatInt24(input, next);
            (concenLiq, next) = eatInt128(input, next);
            bookends[i] = Directives.ConcenBookend({closeTick_: closeTick,
                        liquidity_: concenLiq});
        }
        
        pass = Directives.ConcentratedDirective({openTick_: openTick,
                    bookends_: bookends});
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
        bool inBaseQty_ = (dirFlags & 0x1) > 0;
        swap = Directives.SwapDirective({liqMask_: liqMask, isBuy_: isBuy,
                    inBaseQty_: inBaseQty_, qty_: qty, limitPrice_: limitPrice});
    }

    function parseSettle (bytes calldata input, uint32 offset)
        private pure returns (Directives.SettlementChannel memory settle, uint32 next) {
        address token;
        int128 limitQty;
        uint128 dustThresh;
        uint8 reservesFlag;

        (token, next) = eatToken(input, offset);
        (limitQty, next) = eatInt128(input, next);
        (dustThresh, next) = eatUInt128(input, next);
        (reservesFlag, next) = eatUInt8(input, next);
        
        settle = Directives.SettlementChannel({token_: token, limitQty_: limitQty,
                    dustThresh_: dustThresh, useReserves_: reservesFlag > 0});
    }

    function parseImprove (bytes calldata input, uint32 offset)
        private pure returns (Directives.PriceImproveReq memory req, uint32 next) {
        uint8 flags;

        (flags, next) = eatUInt8(input, offset);

        bool isEnabled = (flags & 0x2) > 0;
        bool useBase = (flags & 0x1) > 0;
        req = Directives.PriceImproveReq({isEnabled_: isEnabled, useBaseSide_: useBase});
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

    function eatUInt256 (bytes calldata input, uint32 offset)
        internal pure returns (uint256 delta, uint32 next) {
        delta = abi.decode(input[offset:(offset+32)], (uint256));
        next = offset + 32;
    }

    function eatUInt128 (bytes calldata input, uint32 offset)
        internal pure returns (uint128 delta, uint32 next) {
        delta = abi.decode(input[offset:(offset+32)], (uint128));
        next = offset + 32;
    }

    function eatInt256 (bytes calldata input, uint32 offset)
        internal pure returns (int256 delta, uint32 next) {
        uint8 isNegFlag;
        uint256 magn;
        (isNegFlag, next) = eatUInt8(input, offset);        
        (magn, next) = eatUInt256(input, next);
        delta = isNegFlag > 0 ? -int256(magn) : int256(magn);
    }

    function eatInt128 (bytes calldata input, uint32 offset)
        internal pure returns (int128 delta, uint32 next) {
        uint8 isNegFlag;
        uint128 magn;
        (isNegFlag, next) = eatUInt8(input, offset);
        (magn, next) = eatUInt128(input, next);
        delta = isNegFlag > 0 ? -int128(magn) : int128(magn);
    }

    function eatInt24 (bytes calldata input, uint32 offset)
        internal pure returns (int24 delta, uint32 next) {
        uint8 isNegFlag;
        uint24 magn;
        (isNegFlag, next) = eatUInt8(input, offset);
        (magn, next) = eatUInt24(input, next);
        delta = isNegFlag > 0 ? -int24(magn) : int24(magn);
    }

}
