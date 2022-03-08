// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './StorageLayout.sol';
import '../libraries/CurveCache.sol';
import '../libraries/Chaining.sol';
import '../libraries/Directives.sol';

import "hardhat/console.sol";

/* @title Cold path injector
 * @notice Because of the Ethereum contract limit, much of the CrocSwap code is pushed
 *         into sidecar proxy contracts, which is involed with DELEGATECALLs. The code
 *         moved to these sidecars is less gas critical ("cold path") than the code in
 *         in the core contract ("hot path"). This provides a facility for invoking that
 *         cold path code and setting up the DELEGATECALLs in a standard and safe way. */
contract ColdPathInjector is StorageLayout {
    using CurveCache for CurveCache.Cache;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;

    /* @notice Passes through the protocolCmd call to a sidecar proxy. */
    function callProtocolCmd (uint16 proxyIdx, bytes calldata input) internal
        returns (bytes memory) {
        require(proxyPaths_[proxyIdx] != address(0));
        require(!inSafeMode_ || proxyIdx == CrocSlots.SAFE_MODE_PROXY_PATH);
        (bool success, bytes memory output) = proxyPaths_[proxyIdx].delegatecall(
            abi.encodeWithSignature("protocolCmd(bytes)", input));
        require(success);
        return output;
    }

    /* @notice Passes through the userCmd call to a sidecar proxy. */
    function callUserCmd (uint16 proxyIdx, bytes calldata input)
        internal returns (bytes memory) {
        require(proxyPaths_[proxyIdx] != address(0));
        require(!inSafeMode_ || proxyIdx == CrocSlots.SAFE_MODE_PROXY_PATH);
        (bool success, bytes memory output) = proxyPaths_[proxyIdx].delegatecall(
            abi.encodeWithSignature("userCmd(bytes)", input));
        require(success);
        return output;
    }

    /* @notice Invokes mintAmbient() call in MicroPaths sidecar and relays the result. */
    function callMintAmbient (CurveCache.Cache memory curve, uint128 liq,
                              bytes32 poolHash) internal
        returns (int128 basePaid, int128 quotePaid) {
        (bool success, bytes memory output) =
            proxyPaths_[CrocSlots.MICRO_PROXY_IDX].delegatecall
            (abi.encodeWithSignature
             ("mintAmbient(uint128,uint128,uint128,uint64,uint64,uint128,bytes32)",
              curve.curve_.priceRoot_, 
              curve.curve_.ambientSeeds_,
              curve.curve_.concLiq_,
              curve.curve_.seedDeflator_,
              curve.curve_.concGrowth_,
              liq, poolHash));
        require(success);
        
        (basePaid, quotePaid,
         curve.curve_.ambientSeeds_) = 
            abi.decode(output, (int128, int128, uint128));
    }

    /* @notice Invokes burnAmbient() call in MicroPaths sidecar and relays the result. */
    function callBurnAmbient (CurveCache.Cache memory curve, uint128 liq,
                              bytes32 poolHash) internal
        returns (int128 basePaid, int128 quotePaid) {

        (bool success, bytes memory output) =
            proxyPaths_[CrocSlots.MICRO_PROXY_IDX].delegatecall
            (abi.encodeWithSignature
             ("burnAmbient(uint128,uint128,uint128,uint64,uint64,uint128,bytes32)",
              curve.curve_.priceRoot_, 
              curve.curve_.ambientSeeds_,
              curve.curve_.concLiq_,
              curve.curve_.seedDeflator_,
              curve.curve_.concGrowth_,
              liq, poolHash));
        require(success);
        
        (basePaid, quotePaid,
         curve.curve_.ambientSeeds_) = 
            abi.decode(output, (int128, int128, uint128));
    }

    /* @notice Invokes mintRange() call in MicroPaths sidecar and relays the result. */
    function callMintRange (CurveCache.Cache memory curve,
                            int24 bidTick, int24 askTick, uint128 liq,
                            bytes32 poolHash) internal
        returns (int128 basePaid, int128 quotePaid) {

        (bool success, bytes memory output) =
            proxyPaths_[CrocSlots.MICRO_PROXY_IDX].delegatecall
            (abi.encodeWithSignature
             ("mintRange(uint128,int24,uint128,uint128,uint64,uint64,int24,int24,uint128,bytes32)",
              curve.curve_.priceRoot_, curve.pullPriceTick(),
              curve.curve_.ambientSeeds_,
              curve.curve_.concLiq_,
              curve.curve_.seedDeflator_,
              curve.curve_.concGrowth_,
              bidTick, askTick, liq, poolHash));
        require(success);

        (basePaid, quotePaid,
         curve.curve_.ambientSeeds_,
         curve.curve_.concLiq_) = 
            abi.decode(output, (int128, int128, uint128, uint128));
    }
    
    /* @notice Invokes burnRange() call in MicroPaths sidecar and relays the result. */
    function callBurnRange (CurveCache.Cache memory curve,
                            int24 bidTick, int24 askTick, uint128 liq,
                            bytes32 poolHash) internal
        returns (int128 basePaid, int128 quotePaid) {
        
        (bool success, bytes memory output) =
            proxyPaths_[CrocSlots.MICRO_PROXY_IDX].delegatecall
            (abi.encodeWithSignature
             ("burnRange(uint128,int24,uint128,uint128,uint64,uint64,int24,int24,uint128,bytes32)",
              curve.curve_.priceRoot_, curve.pullPriceTick(),
              curve.curve_.ambientSeeds_, curve.curve_.concLiq_,
              curve.curve_.seedDeflator_, curve.curve_.concGrowth_,
              bidTick, askTick, liq, poolHash));
        require(success);
        
        (basePaid, quotePaid,
         curve.curve_.ambientSeeds_,
         curve.curve_.concLiq_) = 
            abi.decode(output, (int128, int128, uint128, uint128));
    }

    /* @notice Invokes sweepSwap() call in MicroPaths sidecar and relays the result. */
    function callSwap (Chaining.PairFlow memory accum,
                       CurveCache.Cache memory curve,
                       Directives.SwapDirective memory swap,
                       PoolSpecs.PoolCursor memory pool) internal {
        (bool success, bytes memory output) =
            proxyPaths_[CrocSlots.MICRO_PROXY_IDX].delegatecall
            (abi.encodeWithSignature
             ("sweepSwap((uint128,uint128,uint128,uint64,uint64),int24,(bool,bool,uint8,uint128,uint128),((bool,uint16,uint8,uint16,uint8,uint8,uint8),bytes32,address))",
              curve.curve_, curve.pullPriceTick(), swap, pool));
        require(success);

        Chaining.PairFlow memory swapFlow;
        (swapFlow, curve.curve_.priceRoot_,
         curve.curve_.ambientSeeds_,
         curve.curve_.concLiq_,
         curve.curve_.seedDeflator_,
         curve.curve_.concGrowth_) = 
            abi.decode(output, (Chaining.PairFlow, uint128, uint128, uint128,
                                uint64, uint64));

        // swap() is the only operation that can change curve price, so have to mark
        // the tick cache as dirty.
        curve.dirtyPrice();
        accum.foldFlow(swapFlow);
    }

}
