// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;

import "../mixins/LiquidityCurve.sol";
import "../libraries/SwapCurve.sol";

contract TestLiquidityCurve is LiquidityCurve {
    using TickMath for uint160;
    
    uint256 public baseFlow;
    uint256 public quoteFlow;
    CurveMath.SwapAccum public lastSwap;
    
    function testLiqRecConc (uint8 poolIdx, uint128 liq,
                             uint160 lower, uint160 upper) public {
        (baseFlow, quoteFlow) = liquidityReceivable
            (poolIdx, liq, lower.getTickAtSqrtRatio(), upper.getTickAtSqrtRatio());
    }
    
    function testLiqRecTicks (uint8 poolIdx, uint128 liq,
                              int24 lower, int24 upper) public {
        (baseFlow, quoteFlow) = liquidityReceivable(poolIdx, liq, lower, upper);
    }

    function testLiqRecAmb (uint8 poolIdx, uint128 liqSeed) public {
        (baseFlow, quoteFlow) = liquidityReceivable(poolIdx, liqSeed);
    }

    function testLiqPayConc (uint8 poolIdx, uint128 liq, uint160 lower, uint160 upper,
                             uint256 rewards) public {
        (baseFlow, quoteFlow) = liquidityPayable
            (poolIdx, liq, rewards,
             lower.getTickAtSqrtRatio(), upper.getTickAtSqrtRatio());
    }

    function testLiqPayTicks (uint8 poolIdx, uint128 liq,
                              int24 lower, int24 upper) public {
        (baseFlow, quoteFlow) = liquidityPayable(poolIdx, liq, lower, upper);
    }
    
    function testLiqPayAmb (uint8 poolIdx, uint128 liqSeed) public {
        (baseFlow, quoteFlow) = liquidityPayable(poolIdx, liqSeed);
    }

    function testSwap (uint8 poolIdx, CurveMath.SwapAccum memory accum,
                       uint160 bumpPrice, uint160 swapLimit) public {
        int24 bumpTick = TickMath.getTickAtSqrtRatio(bumpPrice);
        testSwapTick(poolIdx, accum, bumpTick, swapLimit);
    }

    function testSwapTick (uint8 poolIdx, CurveMath.SwapAccum memory accum,
                           int24 bumpTick, uint160 swapLimit) public {
        CurveMath.CurveState memory curve = snapCurve(poolIdx);
        SwapCurve.swapToLimit(curve, accum, bumpTick, swapLimit);
        commitSwapCurve(poolIdx, curve);
        lastSwap = accum;
    }

    function testSwapBumpInf (uint8 poolIdx, CurveMath.SwapAccum memory accum,
                              uint160 swapLimit) public {
        int24 tick = accum.cntx_.isBuy_ ? TickMath.MAX_TICK : TickMath.MIN_TICK;
        testSwapTick(poolIdx, accum, tick, swapLimit);
    }
    
    function testSwapLimitInf (uint8 poolIdx, CurveMath.SwapAccum memory accum) public {
        int24 tick = accum.cntx_.isBuy_ ? TickMath.MAX_TICK : TickMath.MIN_TICK;
        uint160 limit = accum.cntx_.isBuy_ ? TickMath.MAX_SQRT_RATIO+1 :
            TickMath.MIN_SQRT_RATIO-1;
        testSwapTick(poolIdx, accum, tick, limit);
    }

    function fixCurve (uint8 poolIdx, uint160 price,
                       uint128 ambientLiq, uint128 concLiq) public {
        initPrice(poolIdx, price);
        CurveMath.CurveState memory curve = snapCurve(poolIdx);
        curve.liq_.ambientSeed_ = ambientLiq;
        curve.liq_.concentrated_ = concLiq;
        curve.priceRoot_ = price;
        commitSwapCurve(poolIdx, curve);
    }

    function fixAccum (uint8 poolIdx, uint256 ambient, uint256 conc) public {
        CurveMath.CurveState memory curve = snapCurve(poolIdx);
        curve.accum_.ambientGrowth_ = ambient;
        curve.accum_.concTokenGrowth_ = conc;
        commitSwapCurve(poolIdx, curve);
    }

    function pullCurve (uint8 poolIdx) public view returns (CurveMath.CurveState memory) {
        return snapCurve(poolIdx);
    }

    function pullTotalLiq (uint8 poolIdx) public view returns (uint128) {
        return activeLiquidity(poolIdx);
    }
}
