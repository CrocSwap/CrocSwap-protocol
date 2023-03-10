// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import '../libraries/Directives.sol';
import '../libraries/Encoding.sol';
import '../libraries/TokenFlow.sol';
import '../libraries/PriceGrid.sol';
import '../libraries/Chaining.sol';
import '../mixins/SettleLayer.sol';
import '../mixins/PoolRegistry.sol';
import '../mixins/MarketSequencer.sol';
import '../mixins/StorageLayout.sol';

/* @title Micro paths callpath sidecar.
 * @notice Defines a proxy sidecar contract that's used to move code outside the 
 *         main contract to avoid Ethereum's contract code size limit. Contains
 *         mid-level components related to single atomic actions to be called within the
 *         context of a longer compound action on a pre-loaded pool's liquidity curve.
 * 
 * @dev    This exists as a standalone contract but will only ever contain proxy code,
 *         not state. As such it should never be called directly or externally, and should
 *         only be invoked with DELEGATECALL so that it operates on the contract state
 *         within the primary CrocSwap contract. */
contract MicroPaths is MarketSequencer {

    /* @notice Burns liquidity on a concentrated range position within a single curve.
     *
     * @param price The price of the curve. Represented as the square root of the exchange
     *              rate in Q64.64 fixed point
     * @param priceTick The price tick index of the current price of the curve
     * @param seed The ambient liquidity seeds in the current curve.
     * @param conc The active in-range concentrated liquidity in the current curve.
     * @param seedGrowth The cumulative ambient seed deflator in the current curve.
     * @param concGrowth The cumulative concentrated reward growth on the current curve.
     * @param lowTick The price tick index of the lower barrier.
     * @param highTick The price tick index of the upper barrier.
     * @param liq The amount of liquidity to burn.
     * @param poolHash The key hash of the pool the curve belongs to.
     *
     * @return baseFlow The user<->pool flow on the base-side token associated with the 
     *                  action. Negative implies flow from the pool to the user. Positive
     *                  vice versa.
     * @return quoteFlow The user<->pool flow on the quote-side token associated with the 
     *                   action. 
     * @return seedOut The updated ambient seed liquidity on the curve.
     * @return concOut The updated concentrated liquidity on the curve. */     
    function burnRange (uint128 price, int24 priceTick, uint128 seed, uint128 conc,
                        uint64 seedGrowth, uint64 concGrowth,
                        int24 lowTick, int24 highTick, uint128 liq, bytes32 poolHash)
        public payable returns (int128 baseFlow, int128 quoteFlow,
                        uint128 seedOut, uint128 concOut) {
        CurveMath.CurveState memory curve;
        curve.priceRoot_ = price;
        curve.ambientSeeds_ = seed;
        curve.concLiq_ = conc;
        curve.seedDeflator_ = seedGrowth;
        curve.concGrowth_ = concGrowth;
        
        (baseFlow, quoteFlow) = burnRange(curve, priceTick, lowTick, highTick,
                                          liq, poolHash, lockHolder_);

        concOut = curve.concLiq_;
        seedOut = curve.ambientSeeds_;
    }


    /* @notice Mints liquidity on a concentrated range position within a single curve.
     *
     * @param price The price of the curve. Represented as the square root of the exchange
     *              rate in Q64.64 fixed point
     * @param priceTick The price tick index of the current price of the curve
     * @param seed The ambient liquidity seeds in the current curve.
     * @param conc The active in-range concentrated liquidity in the current curve.
     * @param seedGrowth The cumulative ambient seed deflator in the current curve.
     * @param concGrowth The cumulative concentrated reward growth on the current curve.
     * @param lowTick The price tick index of the lower barrier.
     * @param highTick The price tick index of the upper barrier.
     * @param liq The amount of liquidity to mint.
     * @param poolHash The key hash of the pool the curve belongs to.
     *
     * @return baseFlow The user<->pool flow on the base-side token associated with the 
     *                  action. Negative implies flow from the pool to the user. Positive
     *                  vice versa.
     * @return quoteFlow The user<->pool flow on the quote-side token associated with the 
     *                   action. 
     * @return seedOut The updated ambient seed liquidity on the curve.
     * @return concOut The updated concentrated liquidity on the curve. */         
    function mintRange (uint128 price, int24 priceTick, uint128 seed, uint128 conc,
                        uint64 seedGrowth, uint64 concGrowth,
                        int24 lowTick, int24 highTick, uint128 liq, bytes32 poolHash)
        public payable returns (int128 baseFlow, int128 quoteFlow,
                        uint128 seedOut, uint128 concOut) {
        CurveMath.CurveState memory curve;
        curve.priceRoot_ = price;
        curve.ambientSeeds_ = seed;
        curve.concLiq_ = conc;
        curve.seedDeflator_ = seedGrowth;
        curve.concGrowth_ = concGrowth;
        
        (baseFlow, quoteFlow) = mintRange(curve, priceTick, lowTick, highTick, liq,
                                          poolHash, lockHolder_);

        concOut = curve.concLiq_;
        seedOut = curve.ambientSeeds_;
    }
    
    /* @notice Burns liquidity from an ambient liquidity position on a single curve.
     *
     * @param price The price of the curve. Represented as the square root of the exchange
     *              rate in Q64.64 fixed point
     * @param seed The ambient liquidity seeds in the current curve.
     * @param conc The active in-range concentrated liquidity in the current curve.
     * @param seedGrowth The cumulative ambient seed deflator in the current curve.
     * @param concGrowth The cumulative concentrated reward growth on the current curve.
     * @param liq The amount of liquidity to burn.
     * @param poolHash The key hash of the pool the curve belongs to.
     *
     * @return baseFlow The user<->pool flow on the base-side token associated with the 
     *                  action. Negative implies flow from the pool to the user. Positive
     *                  vice versa.
     * @return quoteFlow The user<->pool flow on the quote-side token associated with the 
     *                   action. 
     * @return seedOut The updated ambient seed liquidity on the curve. */     
    function burnAmbient (uint128 price, uint128 seed, uint128 conc,
                          uint64 seedGrowth, uint64 concGrowth,
                          uint128 liq, bytes32 poolHash)
        public payable returns (int128 baseFlow, int128 quoteFlow, uint128 seedOut) {
        CurveMath.CurveState memory curve;
        curve.priceRoot_ = price;
        curve.ambientSeeds_ = seed;
        curve.concLiq_ = conc;
        curve.seedDeflator_ = seedGrowth;
        curve.concGrowth_ = concGrowth;
        
        (baseFlow, quoteFlow) = burnAmbient(curve, liq, poolHash, lockHolder_);
        
        seedOut = curve.ambientSeeds_;
    }

    /* @notice Mints liquidity from an ambient liquidity position on a single curve.
     *
     * @param price The price of the curve. Represented as the square root of the exchange
     *              rate in Q64.64 fixed point
     * @param seed The ambient liquidity seeds in the current curve.
     * @param conc The active in-range concentrated liquidity in the current curve.
     * @param seedGrowth The cumulative ambient seed deflator in the current curve.
     * @param concGrowth The cumulative concentrated reward growth on the current curve.
     * @param liq The amount of liquidity to mint.
     * @param poolHash The key hash of the pool the curve belongs to.
     *
     * @return baseFlow The user<->pool flow on the base-side token associated with the 
     *                  action. Negative implies flow from the pool to the user. Positive
     *                  vice versa.
     * @return quoteFlow The user<->pool flow on the quote-side token associated with the 
     *                   action. 
     * @return seedOut The updated ambient seed liquidity on the curve. */         
    function mintAmbient (uint128 price, uint128 seed, uint128 conc,
                          uint64 seedGrowth, uint64 concGrowth,
                          uint128 liq, bytes32 poolHash)
        public payable returns (int128 baseFlow, int128 quoteFlow, uint128 seedOut) {
        CurveMath.CurveState memory curve;
        curve.priceRoot_ = price;
        curve.ambientSeeds_ = seed;
        curve.concLiq_ = conc;
        curve.seedDeflator_ = seedGrowth;
        curve.concGrowth_ = concGrowth;
        
        (baseFlow, quoteFlow) = mintAmbient(curve, liq, poolHash, lockHolder_);

        seedOut = curve.ambientSeeds_;
    }

    /* @notice Executes a user-directed swap through a single liquidity curve.
     * 
     * @param curve The current state of the liquidity curve.
     * @param midTick The tick index of the current price of the curve.
     * @param swap The parameters of the swap to be executed.
     * @param pool The pre-loaded specification and hash key of the liquidity curve's
     *             pool.
     *
     * @return accum The accumulated flows on the pair associated with the swap.
     * @return priceOut The price of the curve after the swap completes. Represented as
     *                  the square root of the price in Q64.64 fixed point.
     * @return seedOut The ambient liquidity seeds in the curve after the swap completes
     * @return concOut The active in-range concentrated liquidity in the curve post-swap
     * @return ambientOut The cumulative ambient seed deflator on the curve post-swap.
     * @return concGrowthOut The cumulative concentrated rewards growth on the curve 
     *                       post-swap. */
    function sweepSwap (CurveMath.CurveState memory curve, int24 midTick,
                        Directives.SwapDirective memory swap,
                        PoolSpecs.PoolCursor memory pool)
        public payable returns (Chaining.PairFlow memory accum,
                                uint128 priceOut, uint128 seedOut, uint128 concOut,
                                uint64 ambientOut, uint64 concGrowthOut) {
        sweepSwapLiq(accum, curve, midTick, swap, pool);
        
        priceOut = curve.priceRoot_;
        seedOut = curve.ambientSeeds_;
        concOut = curve.concLiq_;
        ambientOut = curve.seedDeflator_;
        concGrowthOut = curve.concGrowth_;
    }

    /* @notice Used at upgrade time to verify that the contract is a valid Croc sidecar proxy and used
     *         in the correct slot. */
    function acceptCrocProxyRole (address, uint16 slot) public payable returns (bool) {
        return slot == CrocSlots.MICRO_PROXY_IDX;
    }
}

