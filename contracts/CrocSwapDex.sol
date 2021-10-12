// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './libraries/PriceGrid.sol';
import './mixins/MarketSequencer.sol';
import './mixins/SettleLayer.sol';
import './mixins/PoolRegistry.sol';
import './mixins/OracleHist.sol';
import './mixins/MarketSequencer.sol';
import './mixins/ColdInjector.sol';
import './interfaces/ICrocSwapHistRecv.sol';
import './CrocSwapCold.sol';
import './CrocSwapWarm.sol';
import './CrocSwapMicro.sol';

import "hardhat/console.sol";

contract CrocSwapDex is MarketSequencer, SettleLayer, PoolRegistry, ProtocolAccount {

    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;

    constructor (address authority) {
        authority_ = authority;
        coldPath_ = address(new CrocSwapColdPath());
        warmPath_ = address(new CrocSwapWarmPath());
        microPath_ = address(new CrocSwapMicroPath());

    }

    function swap (address base, address quote,
                   uint24 poolIdx, bool isBuy, bool inBaseQty, uint128 qty,
                   uint128 limitPrice) reEntrantLock public {
        Directives.SwapDirective memory dir;
        dir.isBuy_ = isBuy;
        dir.inBaseQty_ = inBaseQty;
        dir.qty_ = qty;
        dir.limitPrice_ = limitPrice;

        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        Chaining.PairFlow memory flow = swapOverPool(dir, pool);

        Directives.SettlementChannel memory settle;
        settle.limitQty_ = type(int128).max;
        settle.token_ = base;
        settleFlat(msg.sender, flow.baseFlow_, settle, false);

        settle.token_ = quote;
        settleFlat(msg.sender, flow.quoteFlow_, settle, false);
        accumProtocolFees(flow, base, quote); // Make sure to call before clipping
    }

    
    function trade (bytes calldata input) reEntrantLock public {
        callTradePath(input);
    }

    
    function targetRoll (Chaining.RollTarget memory roll,
                         Directives.ChainingFlags memory flags,
                         TokenFlow.PairSeq memory pair) view private {
        if (flags.rollExit_) {
            roll.inBaseQty_ = !pair.isBaseFront_;
            roll.prePairBal_ = 0;
        } else {
            roll.inBaseQty_ = pair.isBaseFront_;
            roll.prePairBal_ = pair.legFlow_;
        }

        if (flags.offsetSurplus_) {
            address token = flags.rollExit_ ?
                pair.backToken() : pair.frontToken();
            roll.prePairBal_ -= querySurplus(msg.sender, token).toInt128Sign();
        }
    }

    function initPool (address base, address quote, uint24 poolIdx,
                       uint128 price) reEntrantLock public {
        callInitPool(base, quote, poolIdx, price);
    }

    function queryCurve (address base, address quote, uint24 poolIdx)
        public view returns (CurveMath.CurveState memory) {
        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        return curves_[pool.hash_];
    }

    function queryLiquidity (address base, address quote, uint24 poolIdx)
        public view returns (uint128) {
        return queryCurve(base, quote, poolIdx).activeLiquidity();
    }

}
