// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "./Directives.sol";

import "hardhat/console.sol";

/* @title Order encoding library */
library OrderEncoding {

    function decodeOrder (bytes calldata input) internal view returns
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
        private view returns (Directives.HopDirective memory hop, uint32 next) {
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
        Directives.ChainingFlags memory chain;
        (improve, chain, next) = parseHopFlags(input, next);
        
        hop = Directives.HopDirective({pools_: pools, settle_: settle,
                    improve_: improve, chain_: chain});
    }

    function parsePool (bytes calldata input, uint32 offset)
        private view returns (Directives.PoolDirective memory pair, uint32 next) {
        uint24 poolIdx;
        Directives.PassiveDirective memory passive;
        Directives.SwapDirective memory swap;
        Directives.PassiveDirective memory passivePost;
        
        (poolIdx, next) = eatUInt24(input, offset);
        console.log("PoolIdx", poolIdx);
        (passive, next) = parsePassive(input, next);
        (swap, next) = parseSwap(input, next);
        (passivePost, next) = parsePassive(input, next);
        
        pair = Directives.PoolDirective({poolIdx_: poolIdx, passive_: passive,
                    swap_: swap, passivePost_: passivePost});
    }

    function parsePassive (bytes calldata input, uint32 offset)
        private view returns (Directives.PassiveDirective memory pass, uint32 next) {
        uint8 concCnt;

        Directives.AmbientDirective memory ambient;
        (ambient, next) = parseAmbient(input, offset);
        
        (concCnt, next) = eatUInt8(input, next);
        Directives.ConcentratedDirective[] memory concs =
            new Directives.ConcentratedDirective[](concCnt);

        for (uint8 i = 0; i < concCnt; ++i) {
            Directives.ConcentratedDirective memory elem;
            (elem, next) = parseConcentrated(input, next);
            concs[i] = elem;
        }

        pass = Directives.PassiveDirective({ambient_: ambient, conc_: concs});
    }

    function parseAmbient (bytes calldata input, uint32 offset)
        private view returns (Directives.AmbientDirective memory pass,
                              uint32 next) {
        bool isAdd;
        uint128 liq;
        (isAdd, next) = eatBool(input, offset);
        (liq, next) = eatUInt128(input, next);
        pass = Directives.AmbientDirective({isAdd_: isAdd, liquidity_: liq});
    }

    function parseConcentrated (bytes calldata input, uint32 offset)
        private view returns (Directives.ConcentratedDirective memory pass,
                              uint32 next) {
        uint8 bookendCnt;
        bool isAdd;
        uint128 concenLiq;
        int24 openTick;
        int24 closeTick;
        
        (openTick, next) = eatInt24(input, offset);
        (bookendCnt, next) = eatUInt8(input, next);

        Directives.ConcenBookend[] memory bookends =
            new Directives.ConcenBookend[](bookendCnt);
            
        for (uint8 i = 0; i < bookendCnt; ++i) {
            (closeTick, next) = eatInt24(input, next);
            (isAdd, next) = eatBool(input, next);
            (concenLiq, next) = eatUInt128(input, next);
            bookends[i] = Directives.ConcenBookend({closeTick_: closeTick,
                        isAdd_: isAdd, liquidity_: concenLiq});
        }
        
        pass = Directives.ConcentratedDirective({openTick_: openTick,
                    bookends_: bookends});
    }

    function parseSwap (bytes calldata input, uint32 offset)
        private view returns (Directives.SwapDirective memory swap, uint32 next) {
        uint8 liqMask;
        bool isBuy;
        bool inBaseQty;
        uint128 qty;
        uint128 limitPrice;

        (liqMask, next) = eatUInt8(input, offset);
        (isBuy, inBaseQty, next) = eatBool2(input, next);
        (qty, next) = eatUInt128(input, next);
        (limitPrice, next) = eatUInt128(input, next);

        swap = Directives.SwapDirective({liqMask_: liqMask, isBuy_: isBuy,
                    inBaseQty_: inBaseQty, qty_: qty, limitPrice_: limitPrice});
    }

    function parseSettle (bytes calldata input, uint32 offset)
        private view returns (Directives.SettlementChannel memory settle, uint32 next) {
        address token;
        int128 limitQty;
        uint128 dustThresh;
        bool useReserves;

        (token, next) = eatToken(input, offset);
        (limitQty, next) = eatInt128(input, next);
        (dustThresh, next) = eatUInt128(input, next);
        (useReserves, next) = eatBool(input, next);
        
        settle = Directives.SettlementChannel({token_: token, limitQty_: limitQty,
                    dustThresh_: dustThresh, useReserves_: useReserves});
    }

    function parseHopFlags (bytes calldata input, uint32 offset)
        private view returns (Directives.PriceImproveReq memory req,
                              Directives.ChainingFlags memory chain, uint32 next) {
        bool isEnabled;
        bool useBase;
        bool rollExit;
        bool swapDefer;

        (isEnabled, useBase, rollExit, swapDefer, next) = eatBool4(input, offset);

        req = Directives.PriceImproveReq({isEnabled_: isEnabled, useBaseSide_: useBase});
        chain = Directives.ChainingFlags({rollExit_: rollExit, swapDefer_: swapDefer});
    }

    function eatBool (bytes calldata input, uint32 offset)
        internal view returns (bool on, uint32 next) {
        uint8 flag;
        (flag, next) = eatUInt8(input, offset);
        on = (flag > 0);
    }

    function eatBool2 (bytes calldata input, uint32 offset)
        internal view returns (bool onA, bool onB, uint32 next) {
        uint8 flag;
        (flag, next) = eatUInt8(input, offset);
        onA = ((flag & 0x2) > 0);
        onB = ((flag & 0x1) > 0);        
    }

    function eatBool4 (bytes calldata input, uint32 offset)
        internal view returns (bool onA, bool onB, bool onC, bool onD, uint32 next) {
        uint8 flag;
        (flag, next) = eatUInt8(input, offset);
        onA = ((flag & 0x8) > 0);
        onB = ((flag & 0x4) > 0);        
        onC = ((flag & 0x2) > 0);        
        onD = ((flag & 0x1) > 0);        
    }
    
    function eatUInt8 (bytes calldata input, uint32 offset)
        internal view returns (uint8 cnt, uint32 next) {
        cnt = uint8(input[offset]);
        next = offset + 1;
    }

    function eatUInt24 (bytes calldata input, uint32 offset)
        internal view returns (uint24 val, uint32 next) {
        bytes3 coded = input[offset] |
            (bytes3(input[offset+1]) >> 8) |
            (bytes3(input[offset+2]) >> 16);
        val = uint24(coded);
        next = offset + 3;
    }

    function eatToken (bytes calldata input, uint32 offset)
        internal view returns (address token, uint32 next) {
        token = abi.decode(input[offset:(offset+32)], (address));
        next = offset + 32;
    }

    function eatUInt256 (bytes calldata input, uint32 offset)
        internal view returns (uint256 delta, uint32 next) {
        delta = abi.decode(input[offset:(offset+32)], (uint256));
        next = offset + 32;
    }

    function eatUInt128 (bytes calldata input, uint32 offset)
        internal view returns (uint128 delta, uint32 next) {
        delta = abi.decode(input[offset:(offset+32)], (uint128));
        next = offset + 32;
    }

    function eatInt256 (bytes calldata input, uint32 offset)
        internal view returns (int256 delta, uint32 next) {
        uint8 isNegFlag;
        uint256 magn;
        (isNegFlag, next) = eatUInt8(input, offset);        
        (magn, next) = eatUInt256(input, next);
        delta = isNegFlag > 0 ? -int256(magn) : int256(magn);
    }

    function eatInt128 (bytes calldata input, uint32 offset)
        internal view returns (int128 delta, uint32 next) {
        uint8 isNegFlag;
        uint128 magn;
        (isNegFlag, next) = eatUInt8(input, offset);
        (magn, next) = eatUInt128(input, next);
        delta = isNegFlag > 0 ? -int128(magn) : int128(magn);
    }

    function eatInt24 (bytes calldata input, uint32 offset)
        internal view returns (int24 delta, uint32 next) {
        uint8 isNegFlag;
        uint24 magn;
        (isNegFlag, next) = eatUInt8(input, offset);
        (magn, next) = eatUInt24(input, next);
        delta = isNegFlag > 0 ? -int24(magn) : int24(magn);
    }

}
