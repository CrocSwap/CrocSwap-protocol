// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './mixins/CurveTrader.sol';
import './mixins/SettleLayer.sol';
import './mixins/PoolRegistry.sol';

contract CrocSwapBooks is CurveTrader {

    constructor (address authority) {
        authority_ = authority;
        master_ = msg.sender;
        initLock_ = 1000000;
    }

    function runPool (PoolSpecs.PoolCursor memory pool,
                      Directives.PoolDirective memory dir, address owner)
        masterOnly public returns (int256 baseFlow, int256 quoteFlow,
                                   uint256 baseProtoCut, uint256 quoteProtoCut) {
        return tradeOverPool(pool, dir, owner);
    }

    function runInit (PoolSpecs.PoolCursor memory pool, uint128 price)
        masterOnly public returns (int256 baseFlow, int256 quoteFlow) {
        return initCurve(pool, price, initLock_);
    }

    function queryCurve (PoolSpecs.PoolCursor memory pool) public view
        returns (CurveMath.CurveState memory) {
        return snapCurve(pool.hash_);
    }

    function setInitLock (uint128 initLock) authorityOnly public {
        initLock_ = initLock;
    }

    modifier masterOnly() {
        require(msg.sender == master_);
        _;
    }

    modifier authorityOnly() {
        require(msg.sender == authority_);
        _;
    }

    address private immutable master_;
    address private authority_;
    uint128 private initLock_;
}
