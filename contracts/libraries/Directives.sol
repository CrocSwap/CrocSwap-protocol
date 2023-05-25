// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;
pragma experimental ABIEncoderV2;

import "./SafeCast.sol";

/* @title Directive library
 * @notice This library defines common structs and associated helper functions for
 *         user defined trade action directives. */
library Directives {
    using SafeCast for int256;
    using SafeCast for uint256;

    /* @notice Defines a single requested swap on a pre-specified pool.
     *
     * @dev A directive indicating no swap action must set *both* qty and limitPrice to
     *      zero. qty=0 alone will indicate the use of a flexible back-filled rolling 
     *      quantity. 
     *
     * @param isBuy_ If true, swap converts base-side token to quote-side token.
     *               Vice-versa if false.
     * @param inBaseQty_ If true, swap quantity is denominated in base-side token. 
     *                   If false in quote side token.
     * @param rollType_  The flavor of rolling gap fill that should be applied (if any)
     *                   to this leg of the directive. See Chaining.sol for list of
     *                   rolling type codes.
     * @param qty_ The total amount to be swapped. (Or rolling target if rollType_ is 
     *             enabled)
     * @param limitPrice_ The maximum (minimum) *price to pay, if a buy (sell) swap
     *           *at the margin*. I.e. the swap will keep exeucting until the curve
     *           reaches this price (or exhausts the specified quantity.) Represented
     *           as the square root of the pool's price ratio in Q64.64 fixed-point. */
    struct SwapDirective {
        bool isBuy_;
        bool inBaseQty_;
        uint8 rollType_;
        uint128 qty_;
        uint128 limitPrice_;
    }

    /* @notice Defines a sequence of mint/burn actions related to concentrated liquidity
     *         range orders on a single pool.
     *
     * @param lowTick_ A single tick index that defines one side of the range order 
     *                 boundary for all range orders in this directive.
     * @param highTick_ The tick index of the other side of the boundary of the range
     *                  order.
     * @param isAdd_ If true, the action mints new concentrated liquidity. If false, it
     *               burns pre-existing concentrated liquidity. 
     * @param isTickRel_  If true indicates the low and high tick value should be take
     *                    relative to the current price tick. E.g. -5 indicates 5 ticks
     *                    below the current tick. Otherwise, high and low tick values are
     *                    absolute tick index values.
     * @param rollType_  The flavor of rolling gap fill that should be applied (if any)
     *                   to this leg of the directive. See Chaining.sol for list of
     *                   rolling type codes.
     * @param liquidity_ The total amount of concentrated liquidity to add/remove.
     *                   Represented as the equivalent of sqrt(X*Y) liquidity for the 
     *                   equivalent constant-product AMM curve. If rolling is turned
     *                   on, this is instead interpreted as a rolling target value. */
    struct ConcentratedDirective {
        int24 lowTick_;
        int24 highTick_;
        bool isAdd_;
        bool isTickRel_;
        uint8 rollType_;
        uint128 liquidity_;
    }

    /* @notice Along with a root open tick from above defines a single range order mint
     *         or burn action.

    /* @notice Defines a directive related to the mint/burn of ambient liquidity on a 
     *         single pre-specified curve.
     *
     * @dev A directive indicating no ambient mint/burn must set *both* isAdd to false and
     *      liquidity to zero. liquidity=0 alone will indicate the use of a flxeible 
     *      back-filled rolling quantity in place.
     *
     * @param isAdd_ If true, the action mints new ambient liquidity. If false, burns 
     *               pre-existing liquidity in the curve.
     * @param rollType_  The flavor of rolling gap fill that should be applied (if any)
     *                   to this leg of the directive. See Chaining.sol for list of
     *                   rolling type codes.
     * @param liquidity_ The total amount of ambient liquidity to add/remove.
     *                   Represented as the equivalent of sqrt(X*Y) liquidity for a
     *                   constant-product AMM curve. (If this and rollType_ are zero,
     *                   this is a non-action.) */
    struct AmbientDirective {
        bool isAdd_;
        uint8 rollType_;
        uint128 liquidity_;
    }

    /* @param rollExit_ If set to true, use the exit side of the pair's tokens when
     *                  calculating rolling back-fill quantities.
     * @param swapDefer_ If set to true, execute the swap directive *after* the passive
     *                  mint/burn directives for the pool. If false, swap executes first.
     * @param offsetSurplus_ If set to true offset any rolling back-fill quantities with
     *                       the client's pre-existing surplus collateral at the dex. */
    struct ChainingFlags {
        bool rollExit_;
        bool swapDefer_;
        bool offsetSurplus_;
    }

    /* @notice Defines a full suite of trade action directives to be executed on a single
     *         pool within a pre-specified pair.
     * @param poolIdx_ The pool type index that identified the pool to be operated on in
     *                 this pair.
     * @param ambient_ Directive related to ambient liquidity actions (if any).
     * @param conc_ Directives related to concentrated liquidity range orders (if any).
     * @param swap_ Directive for the swap action on the pool (if any).
     * @param chain_ Flags related to chaining order of the directive actions and how
     *               rolling back fill is calculated. */
    struct PoolDirective {
        uint256 poolIdx_;
        AmbientDirective ambient_;
        ConcentratedDirective[] conc_;
        SwapDirective swap_;
        ChainingFlags chain_;
    }

    /* @notice Specifies the settlement procedures between user and dex related to
     *         a single token within a chain of hops in a sequence of one or more
     *         pairs. The same struct is used for the entry/exit terminal tokens as
     *         well as intermediate tokens between pairs.
     *
     * @param token_ The tracker address to the token in the pair. (If set to zero 
     *              specifies native Ethereum as the pair asset.)
     * @param limitQty_ A net flow limit that the user expects the execution to meet
     *    or exceed. Otherwise the transaction is reverted. Negative specifies a minimum
     *    credit from the pool to the user. Positive a maximum debit from user to the 
     *    pool. 
     * @param dustThresh_ A threshold, below which the user requests no transaction is
     *    sent as part of a credit. (Debits are always collected.) Used to avoid 
     *    unnecessary gas cost of a token transfer on an economically meaningless value.
     * @param useSurplus_ If set to true the settlement should attempt to complete using
     *    the client's surplus collateral balance at the dex. */
    struct SettlementChannel {
        address token_;
        int128 limitQty_;
        uint128 dustThresh_;
        bool useSurplus_;
    }

    /* @notice Specified if and how off-grid price improvement is being requested. (Note
     *         that even if requested, there may be no price improvement set for the 
     *         token. To avoid wasted gas, user should check off-chain.)
     * @param isEnabled_ By default, no price improvement is set, avoiding the gas cost
     *         of a storage query. If true, indicates that the user wants to query the
     *         price improvement settings. 
     * @param useBaseSide_ If true requests price improvement from the base-side token
     *         in the pair. Otherwise, requested on the quote-side token. */
    struct PriceImproveReq {
        bool isEnabled_;
        bool useBaseSide_;
    }

    /* @notice Defines a full directive related to a single hop in a sequence of pairs.
     * @param pools_ Defines directives on one or more pools on the pair.
     * @param settle_ Defines the settlement for the token on the *exit* side of the hop.
     *         (The entry side is defined in the previous hop, or the open directive if
     *          this is the first hop in the sequence.)
     * @param improve_ Off-grid price improvement settings. */
    struct HopDirective {
        PoolDirective[] pools_;
        SettlementChannel settle_;
        PriceImproveReq improve_;
    }

    /* @notice Top-level trade order directive, encompassing an arbitrary collection of
     *    of swap, mints, and burns across multiple pools within a chained sequence of 
     *    pairs. 
     * @param open_ Defines the token and settlement for the entry token in the first hop
     *    in the chain.
     * @param hops_ Defines a sequence of directives on pairs that will be executed in the
     *    order specified by this array. */
    struct OrderDirective {
        SettlementChannel open_;
        HopDirective[] hops_;
    }

}
