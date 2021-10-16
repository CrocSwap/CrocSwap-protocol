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
        require(swap.inBaseQty_ == roll.inBaseQty_);
        int128 swapQty = totalBalance(roll, flow);
        overwriteSwap(swap, swapQty);
    }

    /* This function will overwrite the swap directive template to plug the
     * rolling qty. This obviously involves writing the swap quantity. It
     * may also possibly flip the swap direction, which is useful in certain
     * complex scenarios where the user can't exactly predict the direction'
     * of the roll.
     *
     * If rolling plug flips the swap direction, then the limit price will
     * be set in the wrong direction and the trade will fail. In this case
     * we disable limitPrice. This is fine because rolling swaps are only
     * used in the composite code path, where the user can set their output
     * limits at the settle layer. */
    function overwriteSwap (Directives.SwapDirective memory swap,
                            int128 rollQty) private pure {
        bool prevDir = swap.isBuy_;
        swap.isBuy_ = swap.inBaseQty_ ? (rollQty < 0) : (rollQty > 0);
        swap.qty_ = rollQty > 0 ? uint128(rollQty) : uint128(-rollQty);

        if (prevDir != swap.isBuy_) {
            swap.limitPrice_ = swap.isBuy_ ?
                TickMath.MAX_SQRT_RATIO : TickMath.MIN_SQRT_RATIO;
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
        liq = isAdd ?
            liq.shaveRoundLots() :
            liq.shaveRoundLotsUp();
    }

    function plugLiquidity (RollTarget memory roll,
                            CurveMath.CurveState memory curve,
                            PairFlow memory flow)
        internal pure returns (uint128 seed, bool isAdd) {
        uint128 collateral;
        (collateral, isAdd) = collateralDemand(roll, flow);
        uint128 liq = collateral.liquiditySupported(roll.inBaseQty_, curve.priceRoot_);
        seed = CompoundMath.deflateLiqSeed(liq, curve.accum_.ambientGrowth_);
    }

    uint128 constant private BUFFER_COLLATERAL = 4;
    
    function collateralDemand (RollTarget memory roll,
                               PairFlow memory flow) private pure
        returns (uint128 collateral, bool isAdd) {
        int128 collatFlow = totalBalance(roll, flow);

        isAdd = collatFlow < 0;
        collateral = collatFlow > 0 ? uint128(collatFlow) : uint128(-collatFlow);

        if (isAdd) {
            collateral -= BUFFER_COLLATERAL;
        } else {
            collateral += BUFFER_COLLATERAL;
        }
    }

    function determinePriceRange (uint128 curvePrice, int24 lowTick, int24 highTick,
                                  bool inBase) private pure
        returns (uint128 bidPrice, uint128 askPrice) {
        bidPrice = lowTick.getSqrtRatioAtTick();
        askPrice = highTick.getSqrtRatioAtTick();

        if (curvePrice <= bidPrice) {
            require(!inBase);
        } else if (curvePrice >= askPrice) {
            require(inBase);
        } else if (inBase) {
            askPrice = curvePrice;
        } else {
            bidPrice = curvePrice;
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
