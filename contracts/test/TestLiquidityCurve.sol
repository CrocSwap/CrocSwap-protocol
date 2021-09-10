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
    
    function testLiqRecConc (uint128 liq, uint160 lower, uint160 upper) public {
        (baseFlow, quoteFlow) = liquidityReceivable
            (liq, lower.getTickAtSqrtRatio(), upper.getTickAtSqrtRatio());
    }
    
    function testLiqRecTicks (uint128 liq, int24 lower, int24 upper) public {
        (baseFlow, quoteFlow) = liquidityReceivable(liq, lower, upper);
    }

    function testLiqRecAmb (uint128 liqSeed) public {
        (baseFlow, quoteFlow) = liquidityReceivable(liqSeed);
    }

    function testLiqPayConc (uint128 liq, uint160 lower, uint160 upper,
                             uint256 rewards) public {
        (baseFlow, quoteFlow) = liquidityPayable
            (liq, rewards, lower.getTickAtSqrtRatio(), upper.getTickAtSqrtRatio());
    }

    function testLiqPayTicks (uint128 liq, int24 lower, int24 upper) public {
        (baseFlow, quoteFlow) = liquidityPayable(liq, lower, upper);
    }
    
    function testLiqPayAmb (uint128 liqSeed) public {
        (baseFlow, quoteFlow) = liquidityPayable(liqSeed);
    }

    function testSwap (CurveMath.SwapAccum memory accum,
                       uint160 bumpPrice, uint160 swapLimit) public {
        int24 bumpTick = TickMath.getTickAtSqrtRatio(bumpPrice);
        testSwapTick(accum, bumpTick, swapLimit);
    }

    function testSwapTick (CurveMath.SwapAccum memory accum,
                           int24 bumpTick, uint160 swapLimit) public {
        CurveMath.CurveState memory curve = snapCurve();
        SwapCurve.swapToLimit(curve, accum, bumpTick, swapLimit);
        commitSwapCurve(curve);
        lastSwap = accum;
    }

    function testSwapBumpInf (CurveMath.SwapAccum memory accum,
                              uint160 swapLimit) public {
        int24 tick = accum.cntx_.isBuy_ ? TickMath.MAX_TICK : TickMath.MIN_TICK;
        testSwapTick(accum, tick, swapLimit);
    }
    
    function testSwapLimitInf (CurveMath.SwapAccum memory accum) public {
        int24 tick = accum.cntx_.isBuy_ ? TickMath.MAX_TICK : TickMath.MIN_TICK;
        uint160 limit = accum.cntx_.isBuy_ ? TickMath.MAX_SQRT_RATIO+1 :
            TickMath.MIN_SQRT_RATIO-1;
        testSwapTick(accum, tick, limit);
    }

    function fixCurve (uint160 price, uint128 ambientLiq, uint128 concLiq) public {
        initPrice(price);
        CurveMath.CurveState memory curve = snapCurve();
        curve.liq_.ambientSeed_ = ambientLiq;
        curve.liq_.concentrated_ = concLiq;
        curve.priceRoot_ = price;
        commitSwapCurve(curve);
    }

    function fixAccum (uint256 ambient, uint256 conc) public {
        CurveMath.CurveState memory curve = snapCurve();
        curve.accum_.ambientGrowth_ = ambient;
        curve.accum_.concTokenGrowth_ = conc;
        commitSwapCurve(curve);
    }

    function pullCurve() public view returns (CurveMath.CurveState memory) {
        return snapCurve();
    }

    function pullTotalLiq() public view returns (uint128) {
        return activeLiquidity();
    }
}
