// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './mixins/CurveTrader.sol';
import './mixins/SettleLayer.sol';
import './mixins/PoolRegistry.sol';
import './CrocSwapSidecar.sol';

import "hardhat/console.sol";

contract CrocSwapDex is SettleLayer, PoolRegistry {
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;

    constructor (address authority) {
        setPoolAuthority(authority);
        sidecar_ = address(new CrocSwapSidecar(authority));
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
                    CrocSwapSidecar(sidecar_).runPool
                    (pool, order.hops_[i].pools_[j]);

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
        (int256 baseFlow, int256 quoteFlow) = CrocSwapSidecar(sidecar_).
            runInit(pool, price);
        settleInitFlow(msg.sender, base, baseFlow, quote, quoteFlow);
    }

    function queryCurve (address base, address quote, uint24 poolIdx)
        public view returns (CurveMath.CurveState memory) {
        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        return CrocSwapSidecar(sidecar_).queryCurve(pool);
    }

    function queryLiquidity (address base, address quote, uint24 poolIdx)
        public view returns (uint128) {
        return queryCurve(base, quote, poolIdx).activeLiquidity();
    }
    
    modifier reEntrantLock() {
        require(reEntrantLocked_ == false, "A");
        reEntrantLocked_ = true;
        _;
        reEntrantLocked_ = false;
    }

    function getSidecar() public view returns (address) {
        return sidecar_;
    }
    
    bool private reEntrantLocked_;
    address private sidecar_;
    
}
