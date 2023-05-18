// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;
pragma experimental ABIEncoderV2;

import "./SafeCast.sol";
import "./PoolSpecs.sol";
import "./PriceGrid.sol";
import "./CurveMath.sol";

/* @title Trade flow chaining library 
 * @notice Provides common conventions and utility functions for aggregating
 *   and backfilling the user <-> pool flow of token assets within a single
 *   pre-defined pair of assets. */
library Chaining {
    using SafeCast for int128;
    using SafeCast for uint128;
    using CurveMath for uint128;
    using TickMath for int24;
    using LiquidityMath for uint128;
    using CurveMath for CurveMath.CurveState;

    /* Used as an indicator code by long-form orders to indicate how a given sub-
     * directive should size relative to some pre-existing cumulative collateral flow
     * from all the actions on the pool.
     * evaluation of the long form order. Types supported:
     * 
     *    NO_ROLL_TYPE - No rolling fill. Evaluation will treat the set quantity as a 
     *        pre-fixed value in the native domain (i.e. tokens for swaps and liquidity 
     *        units for LP actions).
     *    
     *    ROLL_PASS_POS_TYPE - Rolling fill, but against a fixed token collateral target.
     *        Difference with NO_ROLL_TYPE, is the set quantity will denominate as the unit
     *        of the rolling quantity. I.e. represents token collateral instead of 
     *        liquidity units on LP actions.
     *
     *    ROLL_PASS_NEG_TYPE - Same as ROLL_PASS_POS_TYPE, but rolling quantity will be
     *                         negative.
     *
     *    ROLL_FRAC_TYPE - Fills a fixed-point fraction of the cumulatve rolling flow.
     *                     E.g. can swap 50% of the tokens returned from previous LP burn.
     *                     Denominated in fixed point basis points (1/10,000).
     *
     *    ROLL_DEBIT_TYPE - Fills the cumulative rolling flow with a fixed offset in the 
     *                      direction of user debit. E.g. can swap-buy all the tokens 
     *                      needed, plus slightly more.
     *
     *    ROLL_CREDIT_TYPE - Same as above, but offset in the direction of user credit.
     *                       E.g. can swap-sell all but X tokens from a previous burn 
     *                       operation.*/
    uint8 constant NO_ROLL_TYPE = 0;
    uint8 constant ROLL_PASS_POS_TYPE = 1;
    uint8 constant ROLL_PASS_NEG_TYPE = 2;
    uint8 constant ROLL_FRAC_TYPE = 4;
    uint8 constant ROLL_DEBIT_TYPE = 5;
    uint8 constant ROLL_CREDIT_TYPE = 6;

    /* @notice Common convention that defines the full execution context for 
     *   any arbitrary sequence of tradable actions (swap/mint/burn) within
     *   a single pool.
     * 
     * @param pool_ - The pre-queried specifications for the pool's market specs
     * @param improve_ - The pre-queries specification for off-grid price improvement
     *   requirements. (May be zero if user didn't request price improvement.)
     * @param roll_ - The base target to use for any quantities that are set as 
     *   open-ended rolling gaps. */
    struct ExecCntx {
        PoolSpecs.PoolCursor pool_;
        PriceGrid.ImproveSettings improve_;
        RollTarget roll_;
    }

    /* @notice In certain contexts CrocSwap provides the ability for the user to
    *     substitute pre-fixed quantity fields with empty "rolling" fields that are
    *     back-filled based on some cumulative flow across the execution. For example
    *     a swap may specify to buy however much of quote token was demanded by an
    *     earlier mint action on the pool. This struct provides the context for which 
    *     rolling flow to target if/when those back-fills are used.
    *
    *  @param inBaseQty_ If true, rolling quantity targets will use the cumulative
    *     flows on the base-side token in the pair. If false, will use the quote-side
    *     token flows.
    *  @param prePairBal_ Specifies a pre-set rolling flow offset to add/subtract to
    *     the cumulative flow within the pair. Useful for starting with a preset target
    *     from a previous pool or pair in the chain. */
    struct RollTarget {
        bool inBaseQty_;
        int128 prePairBal_;
    }

    /* @notice Represents the accumulated flow between user and pool within a transaction.
     * 
     * @param baseFlow_ Represents the cumulative base side token flow. Negative for
     *   flow going to the user, positive for flow going to the pool.
     * @param quoteFlow_ The cumulative quote side token flow.
     * @param baseProto_ The total amount of base side tokens being collected as protocol
     *   fees. The above baseFlow_ value is inclusive of this quantity.
     * @param quoteProto_ The total amount of quote tokens being collected as protocol
     *   fees. The above quoteFlow_ value is inclusive of this quantity. */
    struct PairFlow {
        int128 baseFlow_;
        int128 quoteFlow_;
        uint128 baseProto_;
        uint128 quoteProto_;
    }

    /* @notice Increments a PairFlow accumulator with a set of pre-determined flows.
     * @param flow The PairFlow object being accumulated. Function writes to this
     *   structure.
     * @param base The base side token flows. Negative when going to the user, positive
     *   for flows going to the pool.
     * @param quote The quote side token flows. Negative when going to the user, positive
     *   for flows going to the pool. */
    function accumFlow (PairFlow memory flow, int128 base, int128 quote)
        internal pure {
        flow.baseFlow_ += base;
        flow.quoteFlow_ += quote;
    }

    /* @notice Increments a PairFlow accumulator with the flows from another PairFlow
     *   object.
     * @param accum The PairFlow object being accumulated. Function writes to this
     *   structure.
     * @param flow The PairFlow input, whose flow is being added to the accumulator. */
    function foldFlow (PairFlow memory accum, PairFlow memory flow) internal pure {
        accum.baseFlow_ += flow.baseFlow_;
        accum.quoteFlow_ += flow.quoteFlow_;
        accum.baseProto_ += flow.baseProto_;
        accum.quoteProto_ += flow.quoteProto_;
    }

    /* @notice Increments a PairFlow accumulator with the flows from a swap leg.
     * @param flow The PairFlow object being accumulated. Function writes to this
     *   structure.
     * @param inBaseQty Whether the swap was denominated in base or quote side tokens.
     * @param base The base side token flows. Negative when going to the user, positive
     *   for flows going to the pool.
     * @param quote The quote side token flows. Negative when going to the user, positive
     *   for flows going to the pool.
     * @param proto The amount of protocol fees collected by the swap operation. (The
     *   total flows must be inclusive of this value). */
    function accumSwap (PairFlow memory flow, bool inBaseQty,
                        int128 base, int128 quote, uint128 proto) internal pure {
        accumFlow(flow, base, quote);
        if (inBaseQty) {
            flow.quoteProto_ += proto;
        } else {
            flow.baseProto_ += proto;
        }
    }

    /* @notice Computes the amount of ambient liquidity to mint/burn in order to 
     *   neutralize the previously accumulated flow in the pair.
     *
     * @dev Note that because of integer rounding liquidity can't exactly neutralize
     *   a fixed flow of tokens. Therefore this function always rounds in favor of 
     *   leaving the user with a very small collateral credit. With a credit they can
     *   use the dust discard feature at settlement to avoid any token transfer.
     *
     * @param roll Indicates the context for the type of roll target that the call 
     *   should target. (See RollTarget struct above.)
     * @param dir The ambient liquidity directive the liquidity is applied to
     * @param curve The liquidity curve that is being minted or burned against.
     * @param flow The previously accumulated flow on this pair. Based on the context 
     *   above, this function will target the accumulated flow contained herein.
     * 
     * @return liq The amount of ambient liquidity to mint/burn to meet the target.
     * @return isAdd If true, then liquidity must be minted to neutralize rolling flow,
     *   If false, then liquidity must be burned. */
    function plugLiquidity (RollTarget memory roll,
                            Directives.AmbientDirective memory dir,
                            CurveMath.CurveState memory curve,
                            PairFlow memory flow) internal pure {
        if (dir.rollType_ != NO_ROLL_TYPE) {
            (uint128 collateral, bool isAdd) =
                collateralDemand(roll, flow, dir.rollType_, dir.liquidity_);

            uint128 liq = sizeAmbientLiq
                (collateral, isAdd, curve.priceRoot_, roll.inBaseQty_);
            (dir.liquidity_, dir.isAdd_) = (liq, isAdd);
        }
    }
    
    /* @notice Computes the amount of concentrated liquidity to mint/burn in order to 
     *   neutralize the previously accumulated flow in the pair.
     *
     * @dev Note that concentrated liquidity is represented as lots 1024. The results of
     *   this function will always conform to that multiple. Because of integer rounding
     *   it's impossible to guarantee a liquidity value that exactly neutralizes an 
     *   arbitrary token flow quantity. Therefore this function always rounds in favor of 
     *   leaving the user with a very small collateral credit. With a credit they can
     *   use the dust discard feature at settlement to avoid any token transfer.
     *
     * @param roll Indicates the context for the type of roll target that the call 
     *   should target. (See RollTarget struct above.)
     * @param bend The concentrated range order directive the liquidity is applied to
     * @param curve The liquidity curve that is being minted or burned against.
     * @param flow The previously accumulated flow on this pair. Based on the context 
     *   above, this function will target the accumulated flow contained herein.
     * @param lowTick The tick index of the lower bound of the concentrated liquidity
     * @param highTick The tick index of the upper bound of the concentrated liquidity
     * 
     * @return seed The amount of ambient liquidity seeds to mint/burn to meet the
     *   target. 
     * @return isAdd If true, then liquidity must be minted to neutralize rolling flow,
     *   If false, then liquidity must be burned. */
    function plugLiquidity (RollTarget memory roll,
                            Directives.ConcentratedDirective memory bend,
                            CurveMath.CurveState memory curve,
                            int24 lowTick, int24 highTick, PairFlow memory flow)
        internal pure {
        if (bend.rollType_ == NO_ROLL_TYPE) { return; }

        (uint128 collateral, bool isAdd) = collateralDemand(roll, flow, bend.rollType_,
                                                            bend.liquidity_);
        uint128 liq = sizeConcLiq(collateral, isAdd, curve.priceRoot_,
                                  lowTick, highTick, roll.inBaseQty_);
        (bend.liquidity_, bend.isAdd_) = (liq, isAdd);
    }

    /* @notice Calculates the amount of ambient liquidity that a fixed amount of token
     *         collateral maps to into the the pool.
     *
     * @dev Will always round liquidity conservatively. That is when being used in an add
     *      liquidity context, user can be assured that the liquidity requires slightly
     *      less than their collateral commitment. And when liquidity is being removed
     *      collateral will be slightly higher for the amount of removed liquidity.
     * 
     * @param collateral The amount of collateral (either base of quote) tokens that we
     *                   want to size liquidity for.
     * @param isAdd Indicates whether the liquidity is being added or removed. Necessary
     *              to make sure that we round conservatively.
     * @param priceRoot The current price in the pool.
     * @param inBaseQty True if the collateral is a base token value, false if quote 
     *                  token.
     * @return The amount of liquidity, in sqrt(X*Y) units, supported by this 
     *         collateral. */
    function sizeAmbientLiq (uint128 collateral, bool isAdd, uint128 priceRoot,
                             bool inBaseQty) internal pure returns (uint128) {
        uint128 liq = bufferCollateral(collateral, isAdd)
            .liquiditySupported(inBaseQty, priceRoot);
        return isAdd ? liq : (liq + 1);
    }

    /* @notice Same as sizeAmbientLiq() (see above), but calculates for concentrated 
     *         liquidity in a given range.
     * 
     * @param collateral The amount of collateral (either base of quote) tokens that we
     *                   want to size liquidity for.
     * @param isAdd Indicates whether the liquidity is being added or removed. Necessary
     *              to make sure that we round conservatively.
     * @param priceRoot The current price in the pool.
     * @param lowTick The tick index of the lower bound of the concentrated liquidity 
     *                range.
     * @param highTick The tick index of the upper bound.
     * @param inBaseQty True if the collateral is a base token value, false if quote 
     *                  token.
     * @return The amount of concentrated liquidity (in sqrt(X*Y) units) supported in
     *         the given tick range. */
    function sizeConcLiq (uint128 collateral, bool isAdd, uint128 priceRoot,
                          int24 lowTick, int24 highTick, bool inBaseQty)
        internal pure returns (uint128) {
        (uint128 bidPrice, uint128 askPrice) =
            determinePriceRange(priceRoot, lowTick, highTick, inBaseQty);
        
        uint128 liq = bufferCollateral(collateral, isAdd)
            .liquiditySupported(inBaseQty, bidPrice, askPrice);

        return isAdd ?
            liq.shaveRoundLots() :
            liq.shaveRoundLotsUp();
    }

    // Represents a small, economically meaningless amount of token wei that makes sure
    // we're always leaving the user with a collateral credit.    
    function bufferCollateral (uint128 collateral, bool isAdd)
        private pure returns (uint128) {
        uint128 BUFFER_COLLATERAL = 4;

        if (isAdd) {
            // This ternary switch always produces non-negative result, preventing underflow
            return collateral < BUFFER_COLLATERAL ? 0 :
                collateral - BUFFER_COLLATERAL;
        } else {
            // This ternary switch prevents buffering into an overflow
            return collateral > type(uint128).max - 4 ?
                type(uint128).max :
                collateral + BUFFER_COLLATERAL;
        }
    }

    /* @notice Converts a swap that's indicated to be a rolling gap-fill into one
     *   with quantity and direction set to neutralize hitherto accumulated rolling
     *   flow. E.g. if the user previously performed a buy swap, this would output
     *   a sell swap with an exactly opposite quantity.
     *
     * @param roll Indicates the context for the type of roll target that the call 
     *   should target. (See RollTarget struct above.)
     * @param swap The templated SwapDirective object. This function will update the
     *   object with the quantity, direction, and (if necessary) price needed to gap-fill
     *   the rolling flow accumulator.
     * @param flow The previously accumulated flow on this pair. Based on the context 
     *   above, this function will target the accumulated flow contained herein. */
    function plugSwapGap (RollTarget memory roll,
                          Directives.SwapDirective memory swap,
                          PairFlow memory flow) internal pure {
        if (swap.rollType_ != NO_ROLL_TYPE) {
            int128 plugQty = scaleRoll(roll, flow, swap.rollType_, swap.qty_);
            overwriteSwap(swap, plugQty);
        }
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

    /* @notice Calculates the total amount of collateral and its direction, that we should
     *   be targeting to neutralize when sizing a liquidity gap-fill. */
    function collateralDemand (RollTarget memory roll, PairFlow memory flow,
                               uint8 rollType, uint128 nextQty) private pure
        returns (uint128 collateral, bool isAdd) {
        int128 collatFlow = scaleRoll(roll, flow, rollType, nextQty);

        isAdd = collatFlow < 0;
        collateral = collatFlow > 0 ? uint128(collatFlow) : uint128(-collatFlow);
    }

    /* @notice Calculates the effective bid/ask committed collateral range related
     *   to a concentrated liquidity range order. The calculation is different depending on
     *   whether the curve price is inside or outside the specified tick range. (See below) */
    function determinePriceRange (uint128 curvePrice, int24 lowTick, int24 highTick,
                                  bool inBase) private pure
        returns (uint128 bidPrice, uint128 askPrice) {
        bidPrice = lowTick.getSqrtRatioAtTick();
        askPrice = highTick.getSqrtRatioAtTick();

        /* The required reserve collateral for a range order is a function of whether
         * the order is in-range or out-of-range. For in range orders the reserves are
         * determined based on the distance between the current price and range boundary
         * price:
         *           Lower range        Curve Price        Upper range
         *                |                  |                  | 
         *    <-----------*******************O*******************------------->
         *                --------------------
         *                 Base token reserves
         *
         * For out of range orders the reserve collateral is a function of the entire
         * width of the range.
         *
         *           Lower range              Upper range       Curve Price
         *                |                        |                 |
         *    <-----------**************************-----------------O---->
         *                --------------------------
         *                   Base token reserves
         *
         * And if the curve is out of range on the opposite side, the reserve collateral
         * would be zero, and therefore it's impossible to map a non-zero amount of tokens
         * to liquidity (and function reverts)
         *
         *        Curve Price          Lower range              Upper range       
         *           |                     |                        |                 
         *    <------O---------------------**************************---------------------->
         *                                      ZERO base tokens
         */                  
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

    /* @notice Sums the total rolling balance that should be targeted to be neutralized.
     *   Includes both the accumulated flow in the pair and the pre-pair starting balance
     *   set in the RollTarget context (if any). */
    function totalBalance (RollTarget memory roll, PairFlow memory flow)
        private pure returns (int128) {
        int128 pairFlow = (roll.inBaseQty_ ? flow.baseFlow_ : flow.quoteFlow_);
        return roll.prePairBal_ + pairFlow;
    }
    
    /* @notice Given a cumulative rolling flow, calculates a gap-fill quantity based on
     *         rolling target parameters.
     *
     * @param roll The rolling target schematic, set at the begining of the pair hop.
     * @param flow The cumulative collateral flow accumulated in this pair hop so far.
     * @param rollType The type of rolling gap-fill to target (see indicator comments 
     *                 above)
     * @param target   The rolling gap-fill target, contextualized by rollType value.
     * @return         The size optimally scaled to match the rolling gap-fill target. */
    function scaleRoll (RollTarget memory roll, PairFlow memory flow,
                        uint8 rollType, uint128 target) private pure returns (int128) {
        int128 rollGap = totalBalance(roll, flow);
        return scalePlug(rollGap, rollType, target);
    }

    /* @notice Given a fixed rolling gap, scales the next incremental size to achieve
     *         a specific user-defined target.
     *
     * @param rollGap The rolling gap that exists prior to this leg of the long-form order.
     * @param rollType The type of rolling gap-fill to target (see indicator comments 
     *                 above)
     * @param target   The rolling gap-fill target, contextualized by rollType value.
     * @return         The size optimally scaled to match the rolling gap-fill target. */
    function scalePlug (int128 rollGap, uint8 rollType, uint128 target)
        private pure returns (int128) {
        if (rollType == ROLL_PASS_POS_TYPE) { return int128(target); }
        else if (rollType == ROLL_PASS_NEG_TYPE) { return -int128(target); }
        else if (rollType == ROLL_FRAC_TYPE) {
            return int128(int256(rollGap) * int256(int128(target)) / 10000);
        } else if (rollType == ROLL_DEBIT_TYPE) {
            return rollGap + int128(target);
        } else {
            return rollGap - int128(target);
        }
    }

    /* @notice Convenience function to round up flows pinned to liquidity. Will safely 
     *         (i.e. only in the debit direction) round up the flow to the user-specified
     *         qty. This is primarily useful for mints where the user specifies a token 
     *         qty, that gets cast to liquidity, that then gets converted back to
     *         a token quantity amount. Because of fixed-point rounding the latter will
     *         be slightly smaller than the fixed specified amount. For usability and gas
     *         optimization the user will likely want to just pay the full amount. */
    function pinFlow (int128 baseFlow, int128 quoteFlow, uint128 uQty, bool inBase)
        internal pure returns (int128, int128) {
        int128 qty = uQty.toInt128Sign();
        if (inBase && int128(qty) > baseFlow) {
            baseFlow = int128(qty);
        } else if (!inBase && int128(qty) > quoteFlow) {
            quoteFlow = int128(qty);
        }
        return (baseFlow, quoteFlow);
    }
}
