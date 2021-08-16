// SPDX-License-Identifier: Unlicensed

pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import './LowGasSafeMath.sol';
import './SafeCast.sol';
import './FullMath.sol';
import './FixedPoint96.sol';
import './LiquidityMath.sol';
import './CompoundMath.sol';

/// @title Math library for liquidity curve transformation
library CurveMath {
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using LiquidityMath for uint128;
    using CompoundMath for uint256;
    
    struct CurveLiquidity {
        uint128 ambientSeed_;
        uint128 concentrated_;
    }
    
    struct CurveFeeAccum {
        uint256 ambientGrowth_;
        uint256 concTokenGrowth_;
    }
    
    struct CurveState {
        uint160 priceRoot_;
        CurveLiquidity liq_;
        CurveFeeAccum accum_;
    }

    struct SwapFrame {
        bool isBuy_;
        bool inBaseQty_;
        uint24 feeRate_;
        uint8 protoCut_;
    }
    
    struct SwapAccum {
        uint256 qtyLeft_;
        int256 paidBase_;
        int256 paidQuote_;
        uint256 paidProto_;
        SwapFrame cntx_;
    }


    function calcLimitCounter (CurveState memory curve, SwapAccum memory swap,
                               uint160 limitPrice) internal pure returns (uint256) {
        bool isBuy = limitPrice > curve.priceRoot_;
        uint256 denomFlow = calcLimitFlows(curve, swap, limitPrice);
        return invertFlow(activeLiquidity(curve), curve.priceRoot_,
                          denomFlow, isBuy, swap.cntx_.inBaseQty_);
    }

    function calcLimitFlows (CurveState memory curve, SwapAccum memory swap,
                             uint160 limitPrice) internal pure returns (uint256) {
        uint256 limitFlow = calcLimitFlows(curve, swap.cntx_.inBaseQty_, limitPrice);
        return limitFlow > swap.qtyLeft_ ? swap.qtyLeft_ : limitFlow;
    }
    
    function calcLimitFlows (CurveState memory curve, bool inBaseQty,
                             uint160 limitPrice) private pure returns (uint256) {
        uint128 liq = activeLiquidity(curve);
        return inBaseQty ?
            limitBaseDelta(liq, curve.priceRoot_, limitPrice) :
            limitQuoteDelta(liq, limitPrice, curve.priceRoot_);
    }

    function limitBaseDelta (uint128 liq, uint160 price, uint160 limitPrice)
        private pure returns (uint256) {
        uint160 priceDelta = limitPrice > price ?
            limitPrice - price : price - limitPrice;
        return reserveAtPrice(liq, priceDelta, true);
    }

    function limitQuoteDelta (uint128 liq, uint160 price, uint160 limitPrice)
        private pure returns (uint256) {
        uint160 priceDelta = limitPrice > price ?
            limitPrice - price : price - limitPrice;
        uint256 partTerm = FullMath.mulDiv(liq, priceDelta, price);
        return FullMath.mulDiv(partTerm, FixedPoint96.Q96, limitPrice);
    }

    function reserveAtPrice (uint128 liq, uint160 price, bool inBaseQty)
        internal pure returns (uint256) {
        return inBaseQty ?
            FullMath.mulDiv(liq, price, FixedPoint96.Q96) :
            FullMath.mulDiv(liq, FixedPoint96.Q96, price);
    }

    function activeLiquidity (CurveState memory curve) internal pure returns (uint128) {
        uint128 ambient = LiquidityMath.inflateSeed
            (curve.liq_.ambientSeed_, curve.accum_.ambientGrowth_);
        return LiquidityMath.addDelta(ambient, curve.liq_.concentrated_);
    }

    function reverseFlow (uint128 liq, uint160 startPrice, uint160 nextPrice,
                          CurveMath.SwapFrame memory cntx)
        internal pure returns (int256) {
        uint256 initReserve = reserveAtPrice(liq, startPrice, !cntx.inBaseQty_);
        uint256 endReserve = reserveAtPrice(liq, nextPrice, !cntx.inBaseQty_);
        return (initReserve > endReserve) ?
            -int256(initReserve - endReserve) :
            int256(endReserve - initReserve);
    }

    function invertFlow (uint128 liq, uint160 price, uint256 denomFlow,
                         bool isBuy, bool inBaseQty) private pure returns (uint256) {
        uint256 invertReserve = reserveAtPrice(liq, price, !inBaseQty);
        uint256 initReserve = reserveAtPrice(liq, price, inBaseQty);
        
        uint256 endReserve = (isBuy == inBaseQty) ?
            initReserve.add(denomFlow) : initReserve.sub(denomFlow);
        if (endReserve == 0) { return type(uint128).max; }
        
        uint256 endInvert = FullMath.mulDivTrapZero(liq, liq, endReserve);
        return endInvert > invertReserve ?
            endInvert - invertReserve : invertReserve - endInvert;
    }
}
