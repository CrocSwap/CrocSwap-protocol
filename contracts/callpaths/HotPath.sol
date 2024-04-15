// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import '../libraries/Directives.sol';
import '../libraries/Encoding.sol';
import '../libraries/TokenFlow.sol';
import '../libraries/PriceGrid.sol';
import '../mixins/MarketSequencer.sol';
import '../mixins/SettleLayer.sol';
import '../mixins/PoolRegistry.sol';
import '../mixins/MarketSequencer.sol';
import '../mixins/ProtocolAccount.sol';
import '../CrocEvents.sol';

/* @title Hot path mixin.
 * @notice Provides the top-level function for the most common operation: simple one-hop
 *         swap on a single pool in the most gas optimized way. Unlike the other call 
 *         paths this should be imported directly into the main contract.
 * 
 * @dev    Unlike the other callpath sidecars this contains the most gas sensitive and
 *         common operation: a simple swap. We want to keep this the lowest gas spend
 *         possible, and therefore avoid an external DELEGATECALL. Therefore this logic
 *         is inherited both directly by the main contract (allowing for low gas calls)
 *         as well as an explicit proxy contract (allowing for future upgradeability)
 *         which can be utilized through a different call path. */
contract HotPath is MarketSequencer, SettleLayer, ProtocolAccount {
    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;

    constructor(address initialWbera) SettleLayer(initialWbera) {}

    /* @notice Executes a swap on an arbitrary pool. */
    function swapExecute (address base, address quote,
                          uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty,
                          uint16 poolTip, uint128 limitPrice, uint128 minOutput,
                          uint8 reserveFlags) internal
        returns (int128 baseFlow, int128 quoteFlow) {
        
        // Ensure reserve flags are valid
        require(reserveFlags < 0x4, "RF");

        if (base == address(0)) {
            base = wbera;
            // Determine the base value to add based on `isBuy`
            uint8 baseValue = isBuy ? 0x4 : 0x6;
            // Adjust the base value based on `reserveFlags & 0x1`
            reserveFlags = (reserveFlags ^ 0x1) == 0 ? baseValue : baseValue + 1;
        }

        if (quote == address(0)) {
            quote = wbera;
            // Determine the base value to add based on `isBuy`
            uint8 baseValue = isBuy ? 0x6 : 0x4;
            // Adjust the base value based on `reserveFlags & 0x1`
            reserveFlags = (reserveFlags ^ 0x1) == 0 ? baseValue : baseValue + 1;
        }

        PoolSpecs.PoolCursor memory pool = preparePoolCntx
            (base, quote, poolIdx, poolTip, isBuy, inBaseQty, qty);

        Chaining.PairFlow memory flow = swapDir(pool, isBuy, inBaseQty, qty, limitPrice);
        (baseFlow, quoteFlow) = (flow.baseFlow_, flow.quoteFlow_);

        pivotOutFlow(flow, minOutput, isBuy, inBaseQty);        
        settleFlows(base, quote, flow.baseFlow_, flow.quoteFlow_, reserveFlags);
        accumProtocolFees(flow, base, quote);
    }

    /* @notice Final check at swap completion to verify that the non-fixed side of the 
     *         swap meets the user's minimum execution standards: minimum floor if output,
     *         maximum ceiling if input. 
     * @param flow The resulting final token flows from the swap
     * @param minOutput The minimum output (if sell-side token is fixed) *or* maximum inout
     *                  (if buy-side token is fixed)
     * @param isBuy  If true indicates the swap was a buy, i.e. paid base tokens to receive
     *               quote tokens
     * @param inBaseQty If true indicates the base-side was the fixed leg of the swap.
     * @return outFlow Returns the non-fixed side of the swap flow. */
    function pivotOutFlow (Chaining.PairFlow memory flow, uint128 minOutput,
                           bool isBuy, bool inBaseQty) private pure
        returns (int128 outFlow) {
        outFlow = inBaseQty ? flow.quoteFlow_ : flow.baseFlow_;
        bool isOutPaid = (isBuy == inBaseQty);
        int128 thresh = isOutPaid ? -int128(minOutput) : int128(minOutput);
        require(outFlow <= thresh || minOutput == 0, "SL");
    }

    /* @notice Wrapper call to setup the swap directive object and call the swap logic in
     *         the MarketSequencer mixin. */
    function swapDir (PoolSpecs.PoolCursor memory pool, bool isBuy,
                      bool inBaseQty, uint128 qty, uint128 limitPrice) private
        returns (Chaining.PairFlow memory) {
        Directives.SwapDirective memory dir;
        dir.isBuy_ = isBuy;
        dir.inBaseQty_ = inBaseQty;
        dir.qty_ = qty;
        dir.limitPrice_ = limitPrice;
        dir.rollType_ = 0;
        return swapOverPool(dir, pool);
        
    }

    /* @notice Given a pair and pool type index queries and returns the current specs for
     *         that pool. And if permissioned pool, checks against the permit oracle, 
     *         adjusting fee if necessary. */
    function preparePoolCntx (address base, address quote,
                              uint256 poolIdx, uint16 poolTip,
                              bool isBuy, bool inBaseQty, uint128 qty) private
        returns (PoolSpecs.PoolCursor memory) {
        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        if (poolTip > pool.head_.feeRate_) {
            pool.head_.feeRate_ = poolTip;
        }
        verifyPermitSwap(pool, base, quote, isBuy, inBaseQty, qty);
        return pool;
    }

    /* @notice Syntatic sugar that wraps a swapExecute call with an ABI encoded version of
     *         the arguments. */
    function swapEncoded (bytes calldata input) internal returns
        (int128 baseFlow, int128 quoteFlow) {
        (address base, address quote,
         uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty, uint16 poolTip,
         uint128 limitPrice, uint128 minOutput, uint8 reserveFlags) =
            abi.decode(input, (address, address, uint256, bool, bool,
                               uint128, uint16, uint128, uint128, uint8));
        
        return swapExecuteLogged(base, quote, poolIdx, isBuy, inBaseQty, qty, poolTip,
            limitPrice, minOutput, reserveFlags);
    }

    /* @notice Wraps a swap call with a log event. */
    function swapExecuteLogged (address base, address quote,
                          uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty,
                          uint16 poolTip, uint128 limitPrice, uint128 minOutput,
                          uint8 reserveFlags) internal
        returns (int128 baseFlow, int128 quoteFlow) {

        (baseFlow, quoteFlow) = swapExecute(base, quote, poolIdx, isBuy, inBaseQty, qty, poolTip, 
            limitPrice, minOutput, reserveFlags);

        emit CrocEvents.CrocSwap(base, quote, poolIdx, isBuy, inBaseQty, qty, poolTip, limitPrice, 
            minOutput, reserveFlags, baseFlow, quoteFlow);
    }
}

/* @title Hot path proxy contract
 * @notice The version of the HotPath in a standalone sidecar proxy contract. If used
 *         this contract would be attached to hotProxy_ in the main dex contract. */
contract HotProxy is HotPath {

        constructor(address initialWbera) HotPath(initialWbera) { }

    function userCmd (bytes calldata input) public payable
        returns (int128 baseFlow, int128 quoteFlow) {
        return swapEncoded(input);
    }

    /* @notice Used at upgrade time to verify that the contract is a valid Croc sidecar proxy and used
     *         in the correct slot. */
    function acceptCrocProxyRole (address, uint16 slot) public pure returns (bool) {
        return slot == CrocSlots.SWAP_PROXY_IDX;
    }

}


