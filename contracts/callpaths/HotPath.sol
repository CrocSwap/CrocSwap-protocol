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

import "hardhat/console.sol";

contract HotPath is MarketSequencer, SettleLayer, PoolRegistry, ProtocolAccount {

    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;

    function swap (address base, address quote,
                   uint24 poolIdx, bool isBuy, bool inBaseQty, uint128 qty,
                   uint128 limitPrice, bool useSurplus) reEntrantLock public payable {
        Directives.SwapDirective memory dir;
        dir.isBuy_ = isBuy;
        dir.inBaseQty_ = inBaseQty;
        dir.qty_ = qty;
        dir.limitPrice_ = limitPrice;

        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        verifyPermit(pool, base, quote, PoolRegistry.SWAP_ACT_CODE);
        
        Chaining.PairFlow memory flow = swapOverPool(dir, pool);

        settleFlows(base, quote, flow.baseFlow_, flow.quoteFlow_, useSurplus);
        accumProtocolFees(flow, base, quote);
    }
}
