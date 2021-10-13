// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "./SafeCast.sol";
import "./PoolSpecs.sol";
import "./PriceGrid.sol";
import "./CurveMath.sol";

import "hardhat/console.sol";

/* @title Trade chaining library */
library Chaining {
    using SafeCast for int128;
    using SafeCast for uint128;
    using CurveMath for uint128;
    using TickMath for int24;
    using LiquidityMath for uint128;
    using CurveMath for CurveMath.CurveState;
    using CurveMath for CurveMath.CurveState;
    
    struct ExecCntx {
        PoolSpecs.PoolCursor pool_;
        PriceGrid.ImproveSettings improve_;
        RollTarget roll_;
    }

    struct RollTarget {
        bool inBaseQty_;
        int128 prePairBal_;
    }

    struct PairFlow {
        int128 baseFlow_;
        int128 quoteFlow_;
        uint128 baseProto_;
        uint128 quoteProto_;
    }

    function plugSwapGap (RollTarget memory roll,
                          Directives.SwapDirective memory swap,
                          PairFlow memory flow) internal pure {
        if (swap.qty_ == 0 && swap.limitPrice_ > 0) {
            require(swap.inBaseQty_ == roll.inBaseQty_);
            int128 swapQty = totalBalance(roll, flow);

            swap.isBuy_ = swap.inBaseQty_ ? (swapQty < 0) : (swapQty > 0);
            swap.qty_ = swapQty > 0 ? uint128(swapQty) : uint128(-swapQty);
        }
    }

    function plugLiquidity (RollTarget memory roll,
                               CurveMath.CurveState memory curve,
                               PairFlow memory flow, int24 lowTick, int24 highTick)
        internal pure returns (uint128 liq, bool isAdd) {
        uint128 collateral;
        (collateral, isAdd) = collateralDemand(roll, flow);
        (uint128 bidPrice, uint128 askPrice) =
            determinePriceRange(curve.priceRoot_, lowTick, highTick, roll.inBaseQty_);
        liq = collateral.liquiditySupported(roll.inBaseQty_, bidPrice, askPrice);
        if (isAdd) { liq = liq.shaveRoundLots(); }
    }

    function plugLiquidityGap (RollTarget memory roll,
                               CurveMath.CurveState memory curve,
                               PairFlow memory flow)
        internal pure returns (uint128 liq, bool isAdd) {
        uint128 collateral;
        (collateral, isAdd) = collateralDemand(roll, flow);

        liq = collateral.liquiditySupported(roll.inBaseQty_, curve.priceRoot_);
    }

    function collateralDemand (RollTarget memory roll,
                               PairFlow memory flow) private pure
        returns (uint128 collateral, bool isAdd) {
        int128 collatFlow = totalBalance(roll, flow);

        isAdd = collatFlow < 0;
        collateral = collatFlow > 0 ? uint128(collatFlow) : uint128(-collatFlow);
    }

    function determinePriceRange (uint128 curvePrice, int24 lowTick, int24 highTick,
                                  bool inBase) private pure
        returns (uint128 lowPrice, uint128 highPrice) {
        highPrice = highTick.getSqrtRatioAtTick();
        lowPrice = lowTick.getSqrtRatioAtTick();

        if (curvePrice >= lowPrice) {
            lowPrice = curvePrice;
        } else {
            require(!inBase, "LG");
        }

        if (curvePrice <= highPrice) {
            highPrice = curvePrice;
        } else {
            require(inBase, "LG");
        }
    }


    function totalBalance (RollTarget memory roll, PairFlow memory flow)
        private pure returns (int128) {
        int128 pairFlow = (roll.inBaseQty_ ? flow.baseFlow_ : flow.quoteFlow_);
        return roll.prePairBal_ + pairFlow;
    }
    
    function accumSwap (PairFlow memory flow, bool inBaseQty,
                        int128 base, int128 quote, uint128 proto) internal pure {
        accumFlow(flow, base, quote);
        if (inBaseQty) {
            flow.quoteProto_ += proto;
        } else {
            flow.baseProto_ += proto;
        }
    }

    function accumFlow (PairFlow memory flow, int128 base, int128 quote)
        internal pure {
        flow.baseFlow_ += base;
        flow.quoteFlow_ += quote;
    }

    function foldFlow (PairFlow memory obj, PairFlow memory flow) internal pure {
        obj.baseFlow_ += flow.baseFlow_;
        obj.quoteFlow_ += flow.quoteFlow_;
        obj.baseProto_ += flow.baseProto_;
        obj.quoteProto_ += flow.quoteProto_;
    }
}
