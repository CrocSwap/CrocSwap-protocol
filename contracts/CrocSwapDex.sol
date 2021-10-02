// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './mixins/PoolTrader.sol';
import './mixins/SettleLayer.sol';

import "hardhat/console.sol";

contract CrocSwapDex is PoolTrader, SettleLayer {
    using TokenFlow for TokenFlow.PairSeq;
    
    function trade (bytes calldata input) reEntrantLock public {
        Directives.OrderDirective memory order = OrderEncoding.decodeOrder(input);
        Directives.SettlementChannel memory settleChannel = order.open_;
        RollingSpend memory rollSpend = initSettleRoll();
        TokenFlow.PairSeq memory pairs = TokenFlow.initSeq();
        
        for (uint i = 0; i < order.hops_.length; ++i) {
            pairs.nextHop(settleChannel.token_, order.hops_[i].settle_.token_);
            
            for (uint j = 0; j < order.hops_[i].pools_.length; ++j) {
                (int256 baseFlow, int256 quoteFlow) =
                    tradeOverPool(pairs.baseToken_, pairs.quoteToken_,
                                  order.hops_[i].pools_[j]);
                pairs.accumFlow(baseFlow, quoteFlow);
            }

            int settleFlow = pairs.clipFlow();
            settleFlat(msg.sender, settleFlow, settleChannel, rollSpend);
            settleChannel = order.hops_[i].settle_;
        }

        settleFlat(msg.sender, pairs.closeFlow(), settleChannel, rollSpend);
    }
 
    
    modifier reEntrantLock() {
        require(reEntrantLocked_ == false, "A");
        reEntrantLocked_ = true;
        _;
        reEntrantLocked_ = false;
    }
    
    bool private reEntrantLocked_;
}
