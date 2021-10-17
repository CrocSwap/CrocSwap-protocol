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
         int24 bidTick, int24 askTick, uint128 liq, int128 limitQty, bool useSurplus) =
            abi.decode(input, (uint8,address,address,uint24,int24,int24,
                               uint128,int128,bool));
        
        if (code == 1) {
            mint(base, quote, poolIdx, bidTick, askTick, liq, limitQty, useSurplus);
        } else if (code == 2) {
            burn(base, quote, poolIdx, bidTick, askTick, liq, limitQty, useSurplus);
        } else if (code == 3) {
            mint(base, quote, poolIdx, liq, limitQty, useSurplus);
        } else if (code == 4) {
            burn(base, quote, poolIdx, liq, limitQty, useSurplus);
        }
    }
    
    function mint (address base, address quote, uint24 poolIdx,
                   int24 bidTick, int24 askTick, uint128 liq,
                   int128 limitQty, bool useSurplus) internal {
        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        verifyPermit(pool, base, quote, PoolRegistry.MINT_ACT_CODE);

        (int128 baseFlow, int128 quoteFlow) =
            mintOverPool(bidTick, askTick, liq, pool);
        settlePairFlow(base, quote, baseFlow, quoteFlow, false, limitQty, useSurplus);
    }

    function burn (address base, address quote, uint24 poolIdx,
                   int24 bidTick, int24 askTick, uint128 liq,
                   int128 limitQty, bool useSurplus) internal {
        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        verifyPermit(pool, base, quote, PoolRegistry.BURN_ACT_CODE);
        
        (int128 baseFlow, int128 quoteFlow) =
            burnOverPool(bidTick, askTick, liq, pool);
        settlePairFlow(base, quote, baseFlow, quoteFlow, true, limitQty,  useSurplus);
    }


    function mint (address base, address quote, uint24 poolIdx, uint128 liq,
                   int128 limitQty, bool useSurplus) internal {
        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        verifyPermit(pool, base, quote, PoolRegistry.MINT_ACT_CODE);
        
        (int128 baseFlow, int128 quoteFlow) =
            mintOverPool(liq, pool);
        settlePairFlow(base, quote, baseFlow, quoteFlow, false, limitQty,  useSurplus);
    }

    function burn (address base, address quote, uint24 poolIdx, uint128 liq,
                   int128 limitQty, bool useSurplus) internal {
        PoolSpecs.PoolCursor memory pool = queryPool(base, quote, poolIdx);
        verifyPermit(pool, base, quote, PoolRegistry.BURN_ACT_CODE);
        
        (int128 baseFlow, int128 quoteFlow) =
            burnOverPool(liq, pool);
        settlePairFlow(base, quote, baseFlow, quoteFlow, true, limitQty,  useSurplus);
    }

    function settlePairFlow (address base, address quote,
                             int128 baseFlow, int128 quoteFlow,
                             bool isBurn, int128 limitQty, bool useSurplus) internal {
        bool limitInBase = limitQty < 0;
        int128 limitMagn = limitInBase ? -limitQty : limitQty;
        limitQty = isBurn ? -limitMagn : limitMagn;
        
        Directives.SettlementChannel memory settle;
        settle.limitQty_ = limitInBase ? limitQty : type(int128).max;
        settle.useSurplus_ = useSurplus;
        settle.token_ = base;
        int128 ethFlow = settleLeg(msg.sender, baseFlow, settle);

        settle.token_ = quote;
        settle.limitQty_ = !limitInBase ? limitQty : type(int128).max;
        settleFinal(msg.sender, quoteFlow, settle, ethFlow);
    }
}
