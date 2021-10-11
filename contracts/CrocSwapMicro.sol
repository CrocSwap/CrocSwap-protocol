// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './libraries/PriceGrid.sol';
import './mixins/CurveTrader.sol';
import './mixins/SettleLayer.sol';
import './mixins/PoolRegistry.sol';
import './mixins/OracleHist.sol';
import './mixins/CurveTrader.sol';
import './mixins/StorageLayout.sol';
import './interfaces/ICrocSwapHistRecv.sol';

import "hardhat/console.sol";

contract CrocSwapMicroPath is CurveTrader {
    using CurveCache for CurveCache.Cache;

    function burnRange (uint128 price, uint128 seed, uint128 conc,
                        uint64 seedGrowth, uint64 concGrowth,
                        int24 lowTick, int24 highTick, uint128 liq, bytes32 poolHash)
        public returns (int128 baseFlow, int128 quoteFlow,
                        uint128 seedOut, uint128 concOut, int24 priceTick) {
        CurveCache.Cache memory curve;
        curve.curve_.priceRoot_ = price;
        curve.curve_.liq_.ambientSeed_ = seed;
        curve.curve_.liq_.concentrated_ = conc;
        curve.curve_.accum_.ambientGrowth_ = seedGrowth;
        curve.curve_.accum_.concTokenGrowth_ = concGrowth;
        
        (baseFlow, quoteFlow) = burnConcentrated(curve, lowTick, highTick,
                                                 liq, poolHash);

        concOut = curve.curve_.liq_.concentrated_;
        seedOut = curve.curve_.liq_.ambientSeed_;
        priceTick = curve.pullPriceTick();
    }

}

