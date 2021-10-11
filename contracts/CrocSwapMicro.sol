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
import './mixins/Sequencer.sol';
import './mixins/StorageLayout.sol';
import './interfaces/ICrocSwapHistRecv.sol';

import "hardhat/console.sol";

contract CrocSwapMicroPath is Sequencer {

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
}

