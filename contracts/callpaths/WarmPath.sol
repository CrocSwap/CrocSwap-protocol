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
import '../mixins/MarketSequencer.sol';
import '../mixins/ProtocolAccount.sol';
import '../mixins/ColdInjector.sol';

import "hardhat/console.sol";

contract WarmPath is MarketSequencer, SettleLayer, PoolRegistry, ProtocolAccount {

    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;

    function tradeWarm (bytes calldata input) public payable {
        (uint8 code, address base, address quote, uint24 poolIdx,
         int24 bidTick, int24 askTick, uint128 liq, bool useSurplus) =
            abi.decode(input, (uint8,address,address,uint24,int24,int24,uint128,bool));

        if (code == 1) {
            mint(base, quote, poolIdx, bidTick, askTick, liq, useSurplus);
        } else if (code == 2) {
            burn(base, quote, poolIdx, bidTick, askTick, liq, useSurplus);
        } else if (code == 3) {
            mint(base, quote, poolIdx, liq, useSurplus);
        } else if (code == 4) {
            burn(base, quote, poolIdx, liq, useSurplus);
        }

    }
    
    function mint (address base, address quote, uint24 poolIdx,
                   int24 bidTick, int24 askTick, uint128 liq, bool useSurplus) internal {
        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        verifyPermit(pool, base, quote, PoolRegistry.MINT_ACT_CODE);

        (int128 baseFlow, int128 quoteFlow) =
            mintOverPool(bidTick, askTick, liq, pool);
        settlePairFlow(base, quote, baseFlow, quoteFlow, useSurplus);
    }

    function burn (address base, address quote, uint24 poolIdx,
                   int24 bidTick, int24 askTick, uint128 liq, bool useSurplus) internal {
        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        verifyPermit(pool, base, quote, PoolRegistry.BURN_ACT_CODE);
        
        (int128 baseFlow, int128 quoteFlow) =
            burnOverPool(bidTick, askTick, liq, pool);
        settlePairFlow(base, quote, baseFlow, quoteFlow, useSurplus);
    }


    function mint (address base, address quote,
                   uint24 poolIdx, uint128 liq, bool useSurplus) internal {
        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        verifyPermit(pool, base, quote, PoolRegistry.MINT_ACT_CODE);
        
        (int128 baseFlow, int128 quoteFlow) =
            mintOverPool(liq, pool);
        settlePairFlow(base, quote, baseFlow, quoteFlow, useSurplus);
    }

    function burn (address base, address quote,
                   uint24 poolIdx, uint128 liq, bool useSurplus) internal {
        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        verifyPermit(pool, base, quote, PoolRegistry.BURN_ACT_CODE);
        
        (int128 baseFlow, int128 quoteFlow) =
            burnOverPool(liq, pool);
        settlePairFlow(base, quote, baseFlow, quoteFlow, useSurplus);
    }

    function settlePairFlow (address base, address quote,
                             int128 baseFlow, int128 quoteFlow,
                             bool useSurplus) internal {
        Directives.SettlementChannel memory settle;
        settle.limitQty_ = type(int128).max;
        settle.useSurplus_ = useSurplus;
        settle.token_ = base;
        settleFlat(msg.sender, baseFlow, settle, false);

        settle.token_ = quote;
        settleFlat(msg.sender, quoteFlow, settle, false);        
    }
}
