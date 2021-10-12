// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './libraries/PriceGrid.sol';
import './libraries/Chaining.sol';
import './mixins/SettleLayer.sol';
import './mixins/PoolRegistry.sol';
import './mixins/OracleHist.sol';
import './mixins/MarketSequencer.sol';
import './mixins/StorageLayout.sol';
import './interfaces/ICrocSwapHistRecv.sol';

import "hardhat/console.sol";

contract CrocSwapMicroPath is MarketSequencer {

    function burnRange (uint128 price, int24 priceTick, uint128 seed, uint128 conc,
                        uint64 seedGrowth, uint64 concGrowth,
                        int24 lowTick, int24 highTick, uint128 liq, bytes32 poolHash)
        public returns (int128 baseFlow, int128 quoteFlow,
                        uint128 seedOut, uint128 concOut) {
        CurveMath.CurveState memory curve;
        curve.priceRoot_ = price;
        curve.liq_.ambientSeed_ = seed;
        curve.liq_.concentrated_ = conc;
        curve.accum_.ambientGrowth_ = seedGrowth;
        curve.accum_.concTokenGrowth_ = concGrowth;
        
        (baseFlow, quoteFlow) = burnRange(curve, priceTick,
                                          lowTick, highTick, liq, poolHash);

        concOut = curve.liq_.concentrated_;
        seedOut = curve.liq_.ambientSeed_;
    }


    function mintRange (uint128, int24, int24)
        public returns (int128 baseFlow, int128 quoteFlow,
                        uint128 seedOut, uint128 concOut)  {
        
    }
    
    function mintRange (uint128 price, int24 priceTick, uint128 seed, uint128 conc,
                        uint64 seedGrowth, uint64 concGrowth,
                        int24 lowTick, int24 highTick, uint128 liq, bytes32 poolHash)
        public returns (int128 baseFlow, int128 quoteFlow,
                        uint128 seedOut, uint128 concOut) {
        CurveMath.CurveState memory curve;
        curve.priceRoot_ = price;
        curve.liq_.ambientSeed_ = seed;
        curve.liq_.concentrated_ = conc;
        curve.accum_.ambientGrowth_ = seedGrowth;
        curve.accum_.concTokenGrowth_ = concGrowth;
        
        (baseFlow, quoteFlow) = mintRange(curve, priceTick,
                                          lowTick, highTick, liq, poolHash);

        concOut = curve.liq_.concentrated_;
        seedOut = curve.liq_.ambientSeed_;
    }
    
    
    function burnAmbient (uint128 price, uint128 seed, uint128 conc,
                          uint64 seedGrowth, uint64 concGrowth,
                          uint128 liq, bytes32 poolHash)
        public returns (int128 baseFlow, int128 quoteFlow, uint128 seedOut) {
        CurveMath.CurveState memory curve;
        curve.priceRoot_ = price;
        curve.liq_.ambientSeed_ = seed;
        curve.liq_.concentrated_ = conc;
        curve.accum_.ambientGrowth_ = seedGrowth;
        curve.accum_.concTokenGrowth_ = concGrowth;
        
        (baseFlow, quoteFlow) = burnAmbient(curve, liq, poolHash);

        seedOut = curve.liq_.ambientSeed_;
    }

    
    function mintAmbient (uint128 price, uint128 seed, uint128 conc,
                          uint64 seedGrowth, uint64 concGrowth,
                          uint128 liq, bytes32 poolHash)
        public returns (int128 baseFlow, int128 quoteFlow, uint128 seedOut) {
        CurveMath.CurveState memory curve;
        curve.priceRoot_ = price;
        curve.liq_.ambientSeed_ = seed;
        curve.liq_.concentrated_ = conc;
        curve.accum_.ambientGrowth_ = seedGrowth;
        curve.accum_.concTokenGrowth_ = concGrowth;
        
        (baseFlow, quoteFlow) = mintAmbient(curve, liq, poolHash);

        seedOut = curve.liq_.ambientSeed_;
    }


    function sweepSwap (CurveMath.CurveState calldata curve, int24 midTick,
                        Directives.SwapDirective calldata swap,
                        PoolSpecs.PoolCursor calldata pool)
        public returns (Chaining.PairFlow memory accum,
                        uint128 priceOut, uint128 seedOut,
                        uint64 ambientOut, uint64 concOut) {
        sweepSwapLiq(accum, curve, midTick, swap, pool);
        
        priceOut = curve.priceRoot_;
        seedOut = curve.liq_.ambientSeed_;
        ambientOut = curve.accum_.ambientGrowth_;
        concOut = curve.accum_.concTokenGrowth_;
    }
}

