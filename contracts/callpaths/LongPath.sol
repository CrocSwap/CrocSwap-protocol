// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';
import '../libraries/Encoding.sol';
import '../libraries/TokenFlow.sol';
import '../libraries/PriceGrid.sol';
import '../mixins/MarketSequencer.sol';
import '../mixins/SettleLayer.sol';
import '../mixins/PoolRegistry.sol';
import '../mixins/OracleHist.sol';
import '../mixins/ProtocolAccount.sol';
import '../mixins/StorageLayout.sol';
import '../interfaces/ICrocSwapHistRecv.sol';

import "hardhat/console.sol";

contract LongPath is MarketSequencer, PoolRegistry, SettleLayer, ProtocolAccount {
    
    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;

    function trade (bytes calldata input) public payable {
        Directives.OrderDirective memory order = OrderEncoding.decodeOrder(input);
        Directives.SettlementChannel memory settleChannel = order.open_;
        Directives.PoolDirective memory dir;
        TokenFlow.PairSeq memory pairs;
        Chaining.ExecCntx memory cntx;

        bool hasSpentTxSend = false;

        for (uint i = 0; i < order.hops_.length; ++i) {
            pairs.nextHop(settleChannel.token_, order.hops_[i].settle_.token_);
            queryPriceImprove(cntx.improve_, order.hops_[i].improve_,
                              pairs.baseToken_, pairs.quoteToken_);

            for (uint j = 0; j < order.hops_[i].pools_.length; ++j) {
                dir = order.hops_[i].pools_[j];
                cntx.pool_ = queryPool(pairs.baseToken_, pairs.quoteToken_,
                                       dir.poolIdx_);

                verifyPermit(cntx.pool_, pairs.baseToken_, pairs.quoteToken_,
                             PoolRegistry.COMP_ACT_CODE);
                targetRoll(cntx.roll_, dir.chain_, pairs);

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
}
