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

    constructor (address authority) {
        authority_ = authority;
        coldPath_ = address(new ColdPath());
        warmPath_ = address(new WarmPath());
        longPath_ = address(new LongPath());
        microPath_ = address(new MicroPaths());
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

    function mint (address base, address quote,
                   uint24 poolIdx, int24 bidTick, int24 askTick, uint128 liq) public {
        callMintPath(base, quote, poolIdx, bidTick, askTick, liq);
    }

    /*function burn (address base, address quote,
                   uint24 poolIdx, int24 bidTick, int24 askTick, uint128 liq) public {
        callBurnPath(base, quote, poolIdx, bidTick, askTick, liq);
    }

    function mint (address base, address quote, uint24 poolIdx, uint128 liq) public {
        callMintPath(base, quote, poolIdx, liq);
    }

    function burn (address base, address quote, uint24 poolIdx, uint128 liq) public {
        callBurnPath(base, quote, poolIdx, liq);
        }*/


    function initPool (address base, address quote, uint24 poolIdx, uint128 price)
        reEntrantLock public {
        callInitPool(base, quote, poolIdx, price);
    }

    function setTemplate (uint24 poolIdx, uint24 feeRate,
                          uint8 protocolTake, uint16 tickSize,
                          address permitOracle)
        protocolOnly public {
        callSetTemplate(poolIdx, feeRate, protocolTake, tickSize, permitOracle);
    }

    function revisePool (address base, address quote, uint24 poolIdx,
                         uint24 feeRate, uint8 protocolTake, uint16 tickSize)
        protocolOnly public {
        callRevisePool(base, quote, poolIdx, feeRate, protocolTake, tickSize);
    }

    function pegPriceImprove (address token, uint128 unitTickCollateral,
                              uint16 awayTickTol)
        protocolOnly public {
        callPegPriceImprove(token, unitTickCollateral, awayTickTol);
    }
}
