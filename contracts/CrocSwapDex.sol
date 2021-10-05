// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './mixins/CurveTrader.sol';
import './mixins/SettleLayer.sol';
import './mixins/PoolRegistry.sol';

import "hardhat/console.sol";

contract CrocSwapDex is CurveTrader, SettleLayer, PoolRegistry {
    using TokenFlow for TokenFlow.PairSeq;

    constructor (address authority) {
        setPoolAuthority(authority);
    }
    
    function trade (bytes calldata input) reEntrantLock public {
        Directives.OrderDirective memory order = OrderEncoding.decodeOrder(input);
        Directives.SettlementChannel memory settleChannel = order.open_;
        RollingSpend memory rollSpend = initSettleRoll();
        TokenFlow.PairSeq memory pairs = TokenFlow.initSeq();

        for (uint i = 0; i < order.hops_.length; ++i) {
            pairs.nextHop(settleChannel.token_, order.hops_[i].settle_.token_);

            for (uint j = 0; j < order.hops_[i].pools_.length; ++j) {
                PoolSpecs.PoolCursor memory pool =
                    queryPool(pairs.baseToken_, pairs.quoteToken_,
                              order.hops_[i].pools_[j].poolIdx_);
                
                (int256 baseFlow, int256 quoteFlow) =
                    tradeOverPool(pool, order.hops_[i].pools_[j]);
                pairs.accumFlow(baseFlow, quoteFlow);
            }

            int settleFlow = pairs.clipFlow();
            settleFlat(msg.sender, settleFlow, settleChannel, rollSpend);
            settleChannel = order.hops_[i].settle_;
        }

        settleFlat(msg.sender, pairs.closeFlow(), settleChannel, rollSpend);
    }

    function initPool (address base, address quote, uint24 poolIdx,
                       uint128 price) public {
        PoolSpecs.PoolCursor memory pool = registerPool(base, quote, poolIdx);
        (int256 baseFlow, int256 quoteFlow) = initCurve(pool, price, INIT_LOCK_LIQ);
        settleInitFlow(msg.sender, base, baseFlow, quote, quoteFlow);
    }
 
    
    modifier reEntrantLock() {
        require(reEntrantLocked_ == false, "A");
        reEntrantLocked_ = true;
        _;
        reEntrantLocked_ = false;
    }
    
    bool private reEntrantLocked_;
    uint128 private constant INIT_LOCK_LIQ = 1000000;
}
