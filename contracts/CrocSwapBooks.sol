// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './libraries/PriceGrid.sol';
import './libraries/Chaining.sol';
import './mixins/CurveTrader.sol';
import './mixins/StorageLayout.sol';

contract CrocSwapBooks is CurveTrader {

    constructor (address authority) {
        authority_ = authority;
        master_ = msg.sender;
    }

    function runPool (Directives.PoolDirective memory dir,
                      Chaining.ExecCntx memory cntx)
        masterOnly public returns (Chaining.PairFlow memory pair) {
        return tradeOverPool(dir, cntx);
    }

    function runInit (PoolSpecs.PoolCursor memory pool, uint128 price)
        masterOnly public returns (int128 baseFlow, int128 quoteFlow) {
        return initCurve(pool, price, 0);
    }

    function queryCurve (PoolSpecs.PoolCursor memory pool) public view
        returns (CurveMath.CurveState memory) {
        return snapCurve(pool.hash_);
    }
}
