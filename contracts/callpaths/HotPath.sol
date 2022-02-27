// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';
import '../libraries/Encoding.sol';
import '../libraries/TokenFlow.sol';
import '../libraries/PriceGrid.sol';
import '../mixins/MarketSequencer.sol';
import '../mixins/SettleLayer.sol';
import '../mixins/PoolRegistry.sol';
import '../mixins/MarketSequencer.sol';
import '../mixins/ProtocolAccount.sol';

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
contract HotPath is MarketSequencer, SettleLayer, PoolRegistry, ProtocolAccount {
    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;

    
    function swapExecute (address base, address quote,
                          uint24 poolIdx, bool isBuy, bool inBaseQty, uint128 qty,
                          uint128 limitPrice, uint128 limitStart,
                          uint8 reserveFlags) internal {
        Directives.SwapDirective memory dir;
        dir.isBuy_ = isBuy;
        dir.inBaseQty_ = inBaseQty;
        dir.qty_ = qty;
        dir.limitPrice_ = limitPrice;
        
        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        verifyPermitSwap(pool, base, quote, isBuy, inBaseQty, qty);
        
        Chaining.PairFlow memory flow = swapOverPool(dir, pool, limitStart);
        
        settleFlows(base, quote, flow.baseFlow_, flow.quoteFlow_, reserveFlags);
        accumProtocolFees(flow, base, quote);
    }

    function swapEncoded (bytes calldata input) internal {
        (address base, address quote,
         uint24 poolIdx, bool isBuy, bool inBaseQty, uint128 qty,
         uint128 limitPrice, uint128 limitStart, uint8 reserveFlags) =
            abi.decode(input, (address, address, uint24, bool, bool,
                               uint128, uint128, uint128, uint8));
        
        swapExecute(base, quote, poolIdx, isBuy, inBaseQty, qty,
                    limitPrice, limitStart, reserveFlags);
    }
}

/* @title Hot path proxy contract
 * @notice The version of the HotPath in a standalone sidecar proxy contract. If used
 *         this contract would be attached to hotProxy_ in the main dex contract. */
contract HotProxy is HotPath {

    function userCmd (bytes calldata input) public payable {
        swapEncoded(input);
    }
}


