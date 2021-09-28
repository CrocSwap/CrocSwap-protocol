// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

/* @title Pool directive library */
library Directives {

    struct SwapDirective {
        uint8 liqMask_;
        bool isBuy_;
        bool quoteToBase_;
        uint128 qty_;
        uint128 limitPrice_;
    }
    
    struct ConcentratedDirective {
        uint24 openTick_;
        ConcenBookend[] bookends_;
    }
    
    struct ConcenBookend {
        uint24 closeTick_;
        int256 liquidity_;
    }

    struct AmbientDirective {
        int256 liquidity_;
    }

    struct PassiveDirective {
        AmbientDirective ambient_;
        ConcentratedDirective conc_;
    }
    
    struct PoolDirective {
        uint24 poolIdx_;
        PassiveDirective passive_;
        SwapDirective swap_;
        PassiveDirective passivePost_;
    }

    struct PairDirective {
        address tokenX_;
        address tokenY_;
        PoolDirective[] pools_;
    }

    struct SettlementChannel {
        int256 limitQty_;
        uint256 dustThresh_;
        bool useReserves_;
    }

    struct HopDirective {
        PairDirective pair_;
        SettlementChannel settle_;
    }

    struct OrderDirective {
        SettlementChannel open_;
        HopDirective[] hops_;
        SettlementChannel close_;
    }
}
