// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "./SafeCast.sol";

/* @title Pool directive library */
library Directives {
    using SafeCast for int256;
    using SafeCast for uint256;

    struct SwapDirective {
        uint8 liqMask_;
        bool isBuy_;
        bool inBaseQty_;
        uint128 qty_;
        uint128 limitPrice_;
    }
    
    struct ConcentratedDirective {
        int24 openTick_;
        ConcenBookend[] bookends_;
    }
    
    struct ConcenBookend {
        int24 closeTick_;
        bool isAdd_;
        uint128 liquidity_;
    }

    struct RangeOrder {
        bool isAdd_;
        int24 lowerTick_;
        int24 upperTick_;
        uint128 liquidity_;
    }

    struct AmbientDirective {
        bool isAdd_;
        uint128 liquidity_;
    }

    struct PassiveDirective {
        AmbientDirective ambient_;
        ConcentratedDirective[] conc_;
    }
    
    struct PoolDirective {
        uint24 poolIdx_;
        AmbientDirective ambient_;
        ConcentratedDirective[] conc_;
        SwapDirective swap_;
    }

    struct RolloverDirective {
        uint24 poolIdx_;
        uint8 liqMask_;
        uint128 limitPrice_;
    }

    struct SettlementChannel {
        address token_;
        int256 limitQty_;
        uint256 dustThresh_;
        bool useSurplus_;
    }

    struct PriceImproveReq {
        bool isEnabled_;
        bool useBaseSide_;
    }

    struct ChainingFlags {
        bool rollExit_;
        bool swapDefer_;
        bool offsetSurplus_;
    }

    struct HopDirective {
        PoolDirective[] pools_;
        SettlementChannel settle_;
        PriceImproveReq improve_;
        ChainingFlags chain_;
    }

    struct OrderDirective {
        SettlementChannel open_;
        HopDirective[] hops_;
    }

    function sliceBookend (ConcentratedDirective memory dir, uint idx)
        internal pure returns (RangeOrder memory) {
        ConcenBookend memory bend = dir.bookends_[idx];
        (int24 lowerTick, int24 upperTick) =
            pinLowerUpper(dir.openTick_, bend.closeTick_);
        
        return RangeOrder({lowerTick_: lowerTick, upperTick_: upperTick,
                    isAdd_: bend.isAdd_, liquidity_: bend.liquidity_}); 
    }

    function pinLowerUpper (int24 openTick, int24 closeTick)
        private pure returns (int24 lowerTick, int24 upperTick) {
        require(openTick != closeTick);
        if (openTick < closeTick) {
            (lowerTick, upperTick) = (openTick, closeTick);
        } else {
            (lowerTick, upperTick) = (closeTick, openTick);
        }
    }

}
