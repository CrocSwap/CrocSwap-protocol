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
import './mixins/CurveTrader.sol';
import './mixins/ProtocolAccount.sol';
import './mixins/StorageLayout.sol';
import './interfaces/ICrocSwapHistRecv.sol';

import "hardhat/console.sol";

contract CrocSwapWarmPath is CurveTrader, PoolRegistry, SettleLayer, ProtocolAccount {
    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;

    function trade (bytes calldata input) public {
        Directives.OrderDirective memory order = OrderEncoding.decodeOrder(input);
        Directives.SettlementChannel memory settleChannel = order.open_;
        TokenFlow.PairSeq memory pairs;
        Directives.PoolDirective memory dir;
        Chaining.ExecCntx memory cntx;

        bool hasSpentTxSend = false;

        for (uint i = 0; i < order.hops_.length; ++i) {
            pairs.nextHop(settleChannel.token_, order.hops_[i].settle_.token_);
            cntx.improve_ = queryPriceImprove(order.hops_[i].improve_,
                                              pairs.baseToken_, pairs.quoteToken_);

            for (uint j = 0; j < order.hops_[i].pools_.length; ++j) {
                dir = order.hops_[i].pools_[j];
                cntx.pool_ = queryPool(pairs.baseToken_, pairs.quoteToken_,
                                       dir.poolIdx_);

                //targetRoll(cntx.roll_, dir.chain_, pairs);
                verifyPermit(cntx.pool_, pairs.baseToken_, pairs.quoteToken_, dir);
                //Chaining.PairFlow memory poolFlow = callTradePool(dir, cntx);
                Chaining.PairFlow memory poolFlow = tradeOverPool(dir, cntx);
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
}
