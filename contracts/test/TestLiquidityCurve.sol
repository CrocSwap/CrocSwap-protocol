// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;

import "../mixins/LiquidityCurve.sol";
import "../libraries/SwapCurve.sol";

contract TestLiquidityCurve is LiquidityCurve {
    using TickMath for uint128;
    using CurveMath for CurveMath.CurveState;
    
    uint256 public baseFlow;
    uint256 public quoteFlow;
    CurveMath.SwapAccum public lastSwap;

    function liquidityReceivable (bytes32 poolIdx,
                                  uint128 liq, int24 lower, int24 upper)
        internal returns (uint128 base, uint128 flow) {
        CurveMath.CurveState memory curve = snapCurve(poolIdx);
        (base, flow) = liquidityReceivable(curve, liq, lower, upper);
        commitCurve(poolIdx, curve);
    }

    function liquidityReceivable (bytes32 poolIdx, uint128 liq)
        internal returns (uint128 base, uint128 flow) {
        CurveMath.CurveState memory curve = snapCurve(poolIdx);
        (base, flow) = liquidityReceivable(curve, liq);
        commitCurve(poolIdx, curve);
    }

    function liquidityPayable (bytes32 poolIdx,
                               uint128 liq, int24 lower, int24 upper)
        internal returns (uint128 base, uint128 flow) {
        CurveMath.CurveState memory curve = snapCurve(poolIdx);
        (base, flow) = liquidityPayable(curve, liq, lower, upper);
        commitCurve(poolIdx, curve);
    }

    function liquidityPayable (bytes32 poolIdx, uint128 liq, uint64 rewards,
                               int24 lower, int24 upper)
        internal returns (uint128 base, uint128 flow) {
        CurveMath.CurveState memory curve = snapCurve(poolIdx);
        (base, flow) = liquidityPayable(curve, liq, rewards, lower, upper);
        commitCurve(poolIdx, curve);
    }

    function liquidityPayable (bytes32 poolIdx, uint128 liq)
        internal returns (uint128 base, uint128 flow) {
        CurveMath.CurveState memory curve = snapCurve(poolIdx);
        (base, flow) = liquidityPayable(curve, liq);
        commitCurve(poolIdx, curve);
    }

    function testLiqRecConc (uint256 poolIdx, uint128 liq,
                             uint128 lower, uint128 upper) public {
        (baseFlow, quoteFlow) = liquidityReceivable
            (bytes32(poolIdx), liq, lower.getTickAtSqrtRatio(),
             upper.getTickAtSqrtRatio());
    }
    
    function testLiqRecTicks (uint256 poolIdx, uint128 liq,
                              int24 lower, int24 upper) public {
        (baseFlow, quoteFlow) = liquidityReceivable(bytes32(poolIdx), liq, lower, upper);
    }

    function testLiqRecAmb (uint256 poolIdx, uint128 liqSeed) public {
        (baseFlow, quoteFlow) = liquidityReceivable(bytes32(poolIdx), liqSeed);
    }

    function testLiqPayConc (uint256 poolIdx, uint128 liq, uint128 lower, uint128 upper,
                             uint64 rewards) public {
        (baseFlow, quoteFlow) = liquidityPayable
            (bytes32(poolIdx), liq, rewards,
             lower.getTickAtSqrtRatio(), upper.getTickAtSqrtRatio());
    }

    function testLiqPayTicks (uint256 poolIdx, uint128 liq,
                              int24 lower, int24 upper) public {
        (baseFlow, quoteFlow) = liquidityPayable(bytes32(poolIdx), liq, lower, upper);
    }
    
    function testLiqPayAmb (uint256 poolIdx, uint128 liqSeed) public {
        (baseFlow, quoteFlow) = liquidityPayable(bytes32(poolIdx), liqSeed);
    }

    /*function testSwap (uint256 poolIdx, CurveMath.SwapAccum memory accum,
                       uint128 bumpPrice, uint128 swapLimit) public {
        int24 bumpTick = TickMath.getTickAtSqrtRatio(bumpPrice);
        testSwapTick(poolIdx, accum, bumpTick, swapLimit);
    }

    function testSwapTick (uint256 poolIdx, Chaining.PairFlow accum,
                           int24 bumpTick, uint128 swapLimit) public {
        CurveMath.CurveState memory curve = snapCurve(bytes32(poolIdx));
        SwapCurve.swapToLimit(curve, accum, bumpTick, swapLimit);
        commitCurve(bytes32(poolIdx), curve);
        lastSwap = accum;
    }

    function testSwapBumpInf (uint256 poolIdx, CurveMath.SwapAccum memory accum,
                              uint128 swapLimit) public {
        int24 tick = accum.cntx_.isBuy_ ? TickMath.MAX_TICK : TickMath.MIN_TICK;
        testSwapTick(poolIdx, accum, tick, swapLimit);
    }
    
    function testSwapLimitInf (uint256 poolIdx, CurveMath.SwapAccum memory accum) public {
        int24 tick = accum.cntx_.isBuy_ ? TickMath.MAX_TICK : TickMath.MIN_TICK;
        uint128 limit = accum.cntx_.isBuy_ ? TickMath.MAX_SQRT_RATIO+1 :
            TickMath.MIN_SQRT_RATIO-1;
        testSwapTick(poolIdx, accum, tick, limit);
        }*/

    function fixCurve (uint256 poolIdx, uint128 price,
                       uint128 ambientLiq, uint128 concLiq) public {
        CurveMath.CurveState memory curve = snapCurveInit(bytes32(poolIdx));
        curve.priceRoot_ = price;
        curve.liq_.ambientSeed_ = ambientLiq;
        curve.liq_.concentrated_ = concLiq;
        curve.priceRoot_ = price;
        commitCurve(bytes32(poolIdx), curve);
    }

    function fixAccum (uint256 poolIdx, uint64 ambient, uint64 conc) public {
        CurveMath.CurveState memory curve = snapCurve(bytes32(poolIdx));
        curve.accum_.ambientGrowth_ = ambient;
        curve.accum_.concTokenGrowth_ = conc;
        commitCurve(bytes32(poolIdx), curve);
    }

    function pullCurve (uint256 poolIdx) public view returns
        (CurveMath.CurveState memory) {
        return snapCurve(bytes32(poolIdx));
    }

    function pullTotalLiq (uint256 poolIdx) public view returns (uint128) {
        return snapCurve(bytes32(poolIdx)).activeLiquidity();
    }
}
