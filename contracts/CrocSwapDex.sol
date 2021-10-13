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
import './callpaths/ColdPath.sol';
import './callpaths/WarmPath.sol';
import './callpaths/LongPath.sol';
import './callpaths/MicroPaths.sol';

import "hardhat/console.sol";

contract CrocSwapDex is MarketSequencer, SettleLayer, PoolRegistry, ProtocolAccount {

    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;

    constructor (address authority, address coldPath, address warmPath,
                 address longPath, address microPath) {
        authority_ = authority;
        coldPath_ = coldPath;
        warmPath_ = warmPath;
        longPath_ = longPath;
        microPath_ = microPath;
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

    function tradeWarm (bytes calldata input) reEntrantLock public {
        callWarmPath(input);
    }

    function initPool (address base, address quote, uint24 poolIdx, uint128 price)
        reEntrantLock public {
        callInitPool(base, quote, poolIdx, price);
    }

    function collect (address recv, int128 value, address token)
        reEntrantLock public {
        callCollectSurplus(recv, value, token);
    }

    function protocolCmd (bytes calldata input) protocolOnly public {
        callProtocolCmd(input);
    }
}



/* This is a more convenient constructor to call, but the deploy transaction is 100s
 * kb and will get droppped by geth. Useful for testing environments. */
contract CrocSwapDexSeed  is CrocSwapDex {
    
    constructor (address authority)
        CrocSwapDex(authority,
                    address(new ColdPath()),
                    address(new WarmPath()),
                    address(new LongPath()),
                    address(new MicroPaths())) { }
}

