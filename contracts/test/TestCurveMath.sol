// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.7.0;
    
import "../libraries/CurveMath.sol";
import "../libraries/CurveAssimilate.sol";
import "../libraries/CurveRoll.sol";
import "../libraries/SwapCurve.sol";

contract TestCurveMath {

    function testActiveLiq (uint128 seed, uint256 growth, uint128 concentrated)
        public pure returns (uint128) {
        return CurveMath.activeLiquidity(
            buildCurve(seed, growth, concentrated, 0));
    }

    function testVig (uint128 liq, uint256 swapQty, uint24 feeRate, uint8 protoCut,
                      bool isBuy, bool inBase, uint160 curvePrice, uint160 limitPrice)
        public pure returns (uint256, uint256) {
        CurveMath.CurveState memory curve = buildCurve(liq, 0, 0, curvePrice);
        CurveMath.SwapFrame memory cntx = CurveMath.SwapFrame(isBuy, inBase, feeRate, protoCut);
        CurveMath.SwapAccum memory swap = CurveMath.SwapAccum(swapQty, 0, 0, 0, cntx);
        return SwapCurve.vigOverFlow(curve, swap, limitPrice);
    }

    function testVigMin (uint128 liq, uint24 feeRate, uint8 protoCut,
                         bool inBase, uint160 curvePrice)
        public pure returns (uint256, uint256) {
        uint swapQty = type(uint128).max;
        bool isBuy = inBase ? false : true;
        return testVig(liq, swapQty, feeRate, protoCut, isBuy, inBase, curvePrice,
                       TickMath.MIN_SQRT_RATIO);
    }

    function testVigMax (uint128 liq, uint24 feeRate, uint8 protoCut,
                         bool inBase, uint160 curvePrice)
        public pure returns (uint256, uint256) {
        uint swapQty = type(uint128).max;
        bool isBuy = inBase ? true : false;
        return testVig(liq, swapQty, feeRate, protoCut, isBuy, inBase, curvePrice,
                       TickMath.MAX_SQRT_RATIO);
    }

    function testLimitBase (uint160 price, uint160 limitPrice, uint128 liq)
        public pure returns (uint256) {
        CurveMath.CurveState memory curve = buildCurve(liq, 0, 0, price);
        CurveMath.SwapAccum memory swap = buildSwap(1000000, true, true);
        return CurveMath.calcLimitFlows(curve, swap, limitPrice);
    }

    function testLimitQuote (uint160 price, uint160 limitPrice, uint128 liq)
        public pure returns (uint256) {
        CurveMath.CurveState memory curve = buildCurve(liq, 0, 0, price);
        CurveMath.SwapAccum memory swap = buildSwap(1000000, true, false);
        return CurveMath.calcLimitFlows(curve, swap, limitPrice);
    }

    function testCounterBase (uint160 price, uint160 limitPrice, uint128 liq)
        public pure returns (uint256) {
        CurveMath.CurveState memory curve = buildCurve(liq, 0, 0, price);
        CurveMath.SwapAccum memory swap = buildSwap(1000000, true, true);        
        return CurveMath.calcLimitCounter(curve, swap, limitPrice);
    }

    function testCounterQuote (uint160 price, uint160 limitPrice, uint128 liq)
        public pure returns (uint256) {
        CurveMath.CurveState memory curve = buildCurve(liq, 0, 0, price);
        CurveMath.SwapAccum memory swap = buildSwap(1000000, true, false); 
        return CurveMath.calcLimitCounter(curve, swap, limitPrice);
    }

    function testLimitBaseMax (uint160 price, uint128 liq)
        public pure returns (uint256) {
        return testLimitBase(price, TickMath.MAX_SQRT_RATIO, liq);
    }    

    function testLimitBaseMin (uint160 price, uint128 liq)
        public pure returns (uint256) {
        return testLimitBase(price, TickMath.MIN_SQRT_RATIO, liq);
    }    

    function testLimitQuoteMax (uint160 price, uint128 liq)
        public pure returns (uint256) {
        return testLimitQuote(price, TickMath.MAX_SQRT_RATIO, liq);
    }    

    function testLimitQuoteMin (uint160 price, uint128 liq)
        public pure returns (uint256) {
        return testLimitQuote(price, TickMath.MIN_SQRT_RATIO, liq);
    }    

    function testCounterBaseMax (uint160 price, uint128 liq)
        public pure returns (uint256) {
        return testCounterBase(price, TickMath.MAX_SQRT_RATIO, liq);
    }    

    function testCounterBaseMin (uint160 price, uint128 liq)
        public pure returns (uint256) {
        return testCounterBase(price, TickMath.MIN_SQRT_RATIO, liq);
    }    

    function testCounterQuoteMax (uint160 price, uint128 liq)
        public pure returns (uint256) {
        return testCounterQuote(price, TickMath.MAX_SQRT_RATIO, liq);
    }    

    function testCounterQuoteMin (uint160 price, uint128 liq)
        public pure returns (uint256) {
        return testCounterQuote(price, TickMath.MIN_SQRT_RATIO, liq);
    }    

    function testLimitQtyLeft (uint160 price, uint160 limitPrice, uint128 liq,
                               uint256 swapQty)
        public pure returns (uint256) {
        CurveMath.CurveState memory curve = buildCurve(liq, 0, 0, price);
        CurveMath.SwapAccum memory swap = buildSwap(swapQty, true, true);
        return CurveMath.calcLimitFlows(curve, swap, limitPrice);
    }

    function testCounterQtyLeft (uint160 price, uint160 limitPrice, uint128 liq,
                                 uint256 swapQty)
        public pure returns (uint256) {
        CurveMath.CurveState memory curve = buildCurve(liq, 0, 0, price);
        CurveMath.SwapAccum memory swap = buildSwap(swapQty, true, true);
        return CurveMath.calcLimitCounter(curve, swap, limitPrice);
    }

    function testRoll (uint256 flow, uint160 price, uint128 liq,
                       bool isBuy, bool inBase)
        public pure returns (uint160 rollPrice, uint256 qtyLeft,
                             int256 paidBase, int256 paidQuote) {
        CurveMath.SwapAccum memory swap = buildSwap(flow, isBuy, inBase);
        CurveMath.CurveState memory curve = buildCurve(liq, 0, 0, price);
        CurveRoll.rollFlow(curve, flow, swap);
        (rollPrice, qtyLeft, paidBase, paidQuote) =
            (curve.priceRoot_, swap.qtyLeft_, swap.paidBase_, swap.paidQuote_);
    }

    function testRollInf (uint128 liq, uint160 price, bool isBuy, bool inBase)
        public pure returns (uint160 rollPrice, uint256 qtyLeft,
                             int256 paidBase, int256 paidQuote) {
        uint128 flow = (isBuy == inBase) ? type(uint128).max :
            uint128(inBase ?
                    FullMath.mulDiv(liq, price, FixedPoint96.Q96) :
                    FullMath.mulDiv(liq, FixedPoint96.Q96, price));
        (rollPrice, qtyLeft, paidBase, paidQuote) =
            testRoll(flow, price, liq, isBuy, inBase);
    }

    function testAssimilate (uint256 feesPaid, uint160 price,
                             uint128 seed, uint128 conc, uint256 growth, bool inBase)
        public pure returns (uint160 shiftPrice, uint128 shiftSeed,
                             uint256 shiftGrowth, uint256 concGrowth) {
        CurveMath.CurveState memory curve = buildCurve(seed, growth, conc, price);
        CurveAssimilate.assimilateLiq(curve, feesPaid, inBase);
        
        (shiftPrice, shiftSeed) = (curve.priceRoot_, curve.liq_.ambientSeed_);
        (shiftGrowth, concGrowth) = (curve.accum_.ambientGrowth_,
                                     curve.accum_.concTokenGrowth_);
    }

    function testDeriveFlowPrice (uint160 price, uint256 reserve, uint256 flow, 
                                  bool isBuy, bool inBase)
        public pure returns (uint160) {
        CurveMath.SwapFrame memory cntx = CurveMath.SwapFrame(isBuy, inBase, 0, 0);

        return CurveRoll.deriveFlowPrice(price, reserve, flow, cntx);
    }
    
    function testDeriveImpact (uint160 price, uint128 seed, uint256 growth,
                               uint128 conc, uint256 flow, 
                               bool isBuy, bool inBase)
        public pure returns (uint256, uint160) {
        CurveMath.CurveState memory curve = buildCurve(seed, growth, conc, price);
        CurveMath.SwapAccum memory cntx = buildSwap(flow, isBuy, inBase);
        return CurveRoll.deriveImpact(curve, flow, cntx);
    }

    function buildSwap (uint256 flow, bool isBuy, bool inBase)
        private pure returns (CurveMath.SwapAccum memory) {
        CurveMath.SwapFrame memory cntx = CurveMath.SwapFrame(isBuy, inBase, 0, 0);
        return CurveMath.SwapAccum(flow, 0, 0, 0, cntx);
    }
    
    function buildCurve (uint128 seed, uint256 growth, uint128 conc, uint160 price)
        private pure returns (CurveMath.CurveState memory) {
        CurveMath.CurveLiquidity memory liq = CurveMath.CurveLiquidity(seed, conc);
        CurveMath.CurveFeeAccum memory fee = CurveMath.CurveFeeAccum(growth, 0);
        return CurveMath.CurveState(price, liq, fee);        
    }
}
