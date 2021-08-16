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
        private pure returns (uint256) {
        return inBaseQty ?
            FullMath.mulDiv(liq, price, FixedPoint96.Q96) :
            FullMath.mulDiv(liq, FixedPoint96.Q96, price);
    }
        

    function activeLiquidity (CurveState memory curve) internal pure returns (uint128) {
        uint128 ambient = LiquidityMath.inflateSeed
            (curve.liq_.ambientSeed_, curve.accum_.ambientGrowth_);
        return LiquidityMath.addDelta(ambient, curve.liq_.concentrated_);
    }

    function vigOverFlow (CurveState memory curve, SwapAccum memory swap,
                          uint160 limitPrice)
        internal pure returns (uint256 liqFee, uint256 protoFee) {
        uint256 flow = calcLimitCounter(curve, swap, limitPrice);
        (liqFee, protoFee) = vigOverFlow(flow, swap);
    }
    
    function vigOverFlow (uint256 flow, uint24 feeRate, uint8 protoProp)
        private pure returns (uint256 liqFee, uint256 protoFee) {
        uint128 FEE_BP_MULT = 100 * 100 * 100;
        uint256 totalFee = FullMath.mulDiv(flow, feeRate, FEE_BP_MULT);
        protoFee = protoProp == 0 ? 0 : totalFee / protoProp;
        liqFee = totalFee - protoFee;
    }

    function vigOverFlow (uint256 flow, SwapAccum memory swap)
        private pure returns (uint256, uint256) {
        return vigOverFlow(flow, swap.cntx_.feeRate_, swap.cntx_.protoCut_);
    }

    function rollLiqRounded (CurveState memory curve, uint256 flow,
                             SwapAccum memory swap) internal pure {
        rollLiq(curve, flow, swap);
        shaveRoundDown(swap);
    }

    function shaveRoundDown (SwapAccum memory swap) private pure {
        if (isFlowInput(swap.cntx_)) {
            swap.qtyLeft_ = swap.qtyLeft_ - 1;
        }
        
        if (swap.paidQuote_ > 0) {
            swap.paidQuote_ = swap.paidQuote_ + 1;
        } else {
            swap.paidBase_ = swap.paidBase_ + 1;
        }
    }
    
    function rollLiq (CurveState memory curve, uint256 flow,
                      SwapAccum memory swap) internal pure {
        uint128 liq = activeLiquidity(curve);
        uint256 reserve = reserveAtPrice(liq, curve.priceRoot_, swap.cntx_.inBaseQty_);

        uint160 nextPrice = deriveFlowPrice(curve.priceRoot_, reserve, flow, swap.cntx_);
        int256 inverseFlow = reverseFlow(liq, curve.priceRoot_, nextPrice, swap.cntx_);
        int256 paidFlow = signFlow(flow, swap.cntx_);

        curve.priceRoot_ = nextPrice;
        swap.qtyLeft_ = swap.qtyLeft_.sub(flow);
        swap.paidBase_ = swap.paidBase_.add
            (swap.cntx_.inBaseQty_ ? paidFlow : inverseFlow);
        swap.paidQuote_ = swap.paidQuote_.add
            (swap.cntx_.inBaseQty_ ? inverseFlow : paidFlow);
    }

    function deriveFlowPrice (uint160 price, uint256 reserve,
                              uint256 flowMagn, SwapFrame memory cntx)
        private pure returns (uint160) {
        int256 flow = signFlow(flowMagn, cntx);
        uint256 nextReserve = flow > 0 ? reserve.add(uint256(flow)) :
            reserve.sub(uint256(-flow));

        uint256 curvePrice = cntx.inBaseQty_ ?
            FullMath.mulDivTrapZero(price, nextReserve, reserve) :
            FullMath.mulDivTrapZero(price, reserve, nextReserve);
        if (curvePrice > TickMath.MAX_SQRT_RATIO) { return TickMath.MAX_SQRT_RATIO; }
        if (curvePrice < TickMath.MIN_SQRT_RATIO) { return TickMath.MIN_SQRT_RATIO; }
        return uint160(curvePrice);
    }

    function signFlow (uint256 flow, SwapFrame memory cntx)
        private pure returns (int256) {
        if (cntx.inBaseQty_ == cntx.isBuy_) {
            return int256(flow);
        } else {
            return -int256(flow);
        }
    }
    
    function isFlowInput (SwapFrame memory cntx) private pure returns (bool) {
        return cntx.inBaseQty_ == cntx.isBuy_;
    }

    function reverseFlow (uint128 liq, uint160 startPrice, uint160 nextPrice,
                          SwapFrame memory cntx)
        private pure returns (int256) {
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


    function assimilateLiq (CurveState memory curve, uint256 feesPaid,
                            SwapFrame memory cntx) internal pure {
        // In zero liquidity curves, it makes no sense to assimilate, since
        // it will run prices to infinity. 
        if (activeLiquidity(curve) == 0) { return; }
        
        bool feesInBase = !cntx.inBaseQty_;
        uint256 inflator = calcLiqInflator(curve, feesPaid, feesInBase);
        stepToPrice(curve, inflator, feesInBase);
        stepToLiquidity(curve, inflator);
    }

    function calcLiqInflator (CurveState memory curve, uint256 feesPaid,
                              bool inBaseQty) private pure returns (uint256) {
        uint128 liq = activeLiquidity(curve);
        uint256 reserve = reserveAtPrice(liq, curve.priceRoot_, inBaseQty);
        return calcReserveInflator(reserve, feesPaid);
    }

    function calcReserveInflator (uint256 reserve, uint256 feesPaid)
        private pure returns (uint256) {
        uint256 nextReserve = reserve.add(feesPaid);
        uint256 inflator = nextReserve.compoundDivide(reserve);
        return inflator.approxSqrtCompound();
    }

    function stepToPrice (CurveState memory curve, uint256 inflator,
                          bool inBaseQty) private pure {
        uint256 nextPrice = inBaseQty ?
            CompoundMath.compoundGrow(curve.priceRoot_, inflator) :
            CompoundMath.compoundShrink(curve.priceRoot_, inflator);
        curve.priceRoot_ = uint160(nextPrice);
    }

    
    function stepToLiquidity (CurveState memory curve, uint256 inflator) private pure {
        curve.accum_.ambientGrowth_ = curve.accum_.ambientGrowth_
            .compoundAdd(inflator);

        uint256 tokenGrowth = inflator.compoundShrink(curve.accum_.ambientGrowth_);
        curve.accum_.concTokenGrowth_ = curve.accum_.concTokenGrowth_
            .add(tokenGrowth);

        uint256 ambientInject = FullMath.mulDiv
            (tokenGrowth, curve.liq_.concentrated_, FixedPoint128.Q128);
        curve.liq_.ambientSeed_ = curve.liq_.ambientSeed_
            .addDelta(uint128(ambientInject));
    }
}
