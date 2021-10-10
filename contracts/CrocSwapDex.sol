// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './libraries/PriceGrid.sol';
import './mixins/CurveTrader.sol';
import './mixins/SettleLayer.sol';
import './mixins/PoolRegistry.sol';
import './mixins/OracleHist.sol';
import './interfaces/ICrocSwapHistRecv.sol';
import './CrocSwapBooks.sol';

import "hardhat/console.sol";

contract CrocSwapDex is SettleLayer, PoolRegistry, ProtocolAccount,
    OracleHistorian, ICrocSwapHistRecv {

    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;

    constructor (address authority) {
        setPoolAuthority(authority);
        setProtoAcctAuthority(authority);
        booksSidecar_ = address(new CrocSwapBooks(authority));
    }
    
    function trade (bytes calldata input) reEntrantLock public {
        Directives.OrderDirective memory order = OrderEncoding.decodeOrder(input);
        Directives.SettlementChannel memory settleChannel = order.open_;
        TokenFlow.PairSeq memory pairs;
        
        Chaining.ExecCntx memory cntx;
        cntx.oracle_ = address(this);
        cntx.owner_ = msg.sender;
        
        bool hasSpentTxSend = false;
        
        for (uint i = 0; i < order.hops_.length; ++i) {
            pairs.nextHop(settleChannel.token_, order.hops_[i].settle_.token_);
            cntx.improve_ = queryPriceImprove(order.hops_[i].improve_,
                                              pairs.baseToken_, pairs.quoteToken_);

            for (uint j = 0; j < order.hops_[i].pools_.length; ++j) {
                Directives.PoolDirective memory dir = order.hops_[i].pools_[j];
                cntx.pool_ = queryPool(pairs.baseToken_, pairs.quoteToken_,
                                       dir.poolIdx_);
                targetRoll(cntx.roll_, dir.chain_, pairs);
                
                verifyPermit(cntx.pool_, pairs.baseToken_, pairs.quoteToken_, dir);
                
                Chaining.PairFlow memory poolFlow =
                    CrocSwapBooks(booksSidecar_).runPool(dir, cntx);
                pairs.flow_.foldFlow(poolFlow);
            }

            accumProtocolFees(pairs); // Make sure to call before clipping
            int128 settleFlow = pairs.clipFlow();
            hasSpentTxSend = settleFlat(msg.sender, settleFlow, settleChannel,
                                        hasSpentTxSend);
            settleChannel = order.hops_[i].settle_;
        }

        settleFlat(msg.sender, pairs.closeFlow(), settleChannel, hasSpentTxSend);
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
                       uint128 price) public {
        PoolSpecs.PoolCursor memory pool = registerPool(base, quote, poolIdx);
        (int128 baseFlow, int128 quoteFlow) = CrocSwapBooks(booksSidecar_).
            runInit(pool, price);
        settleInitFlow(msg.sender, base, baseFlow, quote, quoteFlow);
    }

    function queryCurve (address base, address quote, uint24 poolIdx)
        public view returns (CurveMath.CurveState memory) {
        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        return CrocSwapBooks(booksSidecar_).queryCurve(pool);
    }

    function queryLiquidity (address base, address quote, uint24 poolIdx)
        public view returns (uint128) {
        return queryCurve(base, quote, poolIdx).activeLiquidity();
    }

    
    function checkpointHist (bytes32 poolKey, int24 startTick,
                             CurveCache.Cache memory curve) public override {
        require(msg.sender == booksSidecar_);
        considerCheckpoint(poolKey, startTick, curve);
    }

    function initHist (bytes32 poolKey, CurveCache.Cache memory curve) public override {
        require(msg.sender == booksSidecar_);
        addCheckpoint(poolKey, curve);
    }

    function getBooksSidecar() public view returns (address) {
        return booksSidecar_;
    }    
}
