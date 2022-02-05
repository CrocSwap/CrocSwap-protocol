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

    /* @notice Passes through the initPool call in ColdPath sidecar. */
    function callInitPool (address base, address quote, uint24 poolIdx,  
                           uint128 price) internal {
        (bool success, ) = coldPath_.delegatecall(
            abi.encodeWithSignature
            ("initPool(address,address,uint24,uint128)",
             base, quote, poolIdx, price));
        require(success);
    }

    /* @notice Passes through the protocolCmd call in ColdPath sidecar. */
    function callProtocolCmd (bytes calldata input) internal {
        (bool success, ) = coldPath_.delegatecall(
            abi.encodeWithSignature("protocolCmd(bytes)", input));
        require(success);
    }

    /* @notice Passes through the collectSurplus call in ColdPath sidecar. */
    function callCollectSurplus (address recv, int128 value, address token,
                                 bool move) internal {
        (bool success, ) = coldPath_.delegatecall(
            abi.encodeWithSignature
            ("collectSurplus(address,int128,address,bool)", recv, value, token, move));
        require(success);
    }

    /* @notice Passes through the approveRouter call in ColdPath sidecar. */
    function callApproveRouter (address router, bool forDebit, bool forBurn) internal {
        (bool success, ) = coldPath_.delegatecall(
            abi.encodeWithSignature
            ("approveRouter(address,bool,bool)", router, forDebit, forBurn));
        require(success);
    }

    /* @notice Passes through the trade() call in LongPath sidecar. */
    function callTradePath (bytes calldata input) internal {
        (bool success, ) = longPath_.delegatecall(
            abi.encodeWithSignature("trade(bytes)", input));
        require(success);
    }

    /* @notice Passes through the tradeWarm() call in WarmPath sidecar. */
    function callWarmPath (bytes calldata input) internal {
        (bool success, ) = warmPath_.delegatecall(
            abi.encodeWithSignature("tradeWarm(bytes)", input));
        require(success);
    }

    /*function callSwapProxy (bytes calldata input) internal {
        (bool success, ) = hotPath_.delegatecall(
            abi.encodeWithSignature("swap(bytes)", input));
        require(success);
        }*/

    /* @notice Passes through the tradeWarm() call in WarmPath sidecar. */
    function callSpillPath (uint8 spillIdx, bytes calldata input) internal {
        (bool success, ) = spillPaths_[spillIdx].delegatecall(
            abi.encodeWithSignature("spillCmd(bytes)", input));
        require(success);
    }

    /* @notice Invokes mintAmbient() call in MicroPaths sidecar and relays the result. */
    function callMintAmbient (CurveCache.Cache memory curve, uint128 liq,
                              bytes32 poolHash) internal
        returns (int128 basePaid, int128 quotePaid) {
        (bool success, bytes memory output) = microPath_.delegatecall
            (abi.encodeWithSignature
             ("mintAmbient(uint128,uint128,uint128,uint64,uint64,uint128,bytes32)",
              curve.curve_.priceRoot_, 
              curve.curve_.liq_.ambientSeed_,
              curve.curve_.liq_.concentrated_,
              curve.curve_.accum_.ambientGrowth_,
              curve.curve_.accum_.concTokenGrowth_,
              liq, poolHash));
        require(success);
        
        (basePaid, quotePaid,
         curve.curve_.liq_.ambientSeed_) = 
            abi.decode(output, (int128, int128, uint128));
    }

    /* @notice Invokes burnAmbient() call in MicroPaths sidecar and relays the result. */
    function callBurnAmbient (CurveCache.Cache memory curve, uint128 liq,
                              bytes32 poolHash) internal
        returns (int128 basePaid, int128 quotePaid) {

        (bool success, bytes memory output) = microPath_.delegatecall
            (abi.encodeWithSignature
             ("burnAmbient(uint128,uint128,uint128,uint64,uint64,uint128,bytes32)",
              curve.curve_.priceRoot_, 
              curve.curve_.liq_.ambientSeed_,
              curve.curve_.liq_.concentrated_,
              curve.curve_.accum_.ambientGrowth_,
              curve.curve_.accum_.concTokenGrowth_,
              liq, poolHash));
        require(success);
        
        (basePaid, quotePaid,
         curve.curve_.liq_.ambientSeed_) = 
            abi.decode(output, (int128, int128, uint128));
    }

    /* @notice Invokes mintRange() call in MicroPaths sidecar and relays the result. */
    function callMintRange (CurveCache.Cache memory curve,
                            int24 bidTick, int24 askTick, uint128 liq,
                            bytes32 poolHash) internal
        returns (int128 basePaid, int128 quotePaid) {

        (bool success, bytes memory output) = microPath_.delegatecall
            (abi.encodeWithSignature
             ("mintRange(uint128,int24,uint128,uint128,uint64,uint64,int24,int24,uint128,bytes32)",
              curve.curve_.priceRoot_, curve.pullPriceTick(),
              curve.curve_.liq_.ambientSeed_,
              curve.curve_.liq_.concentrated_,
              curve.curve_.accum_.ambientGrowth_, curve.curve_.accum_.concTokenGrowth_,
              bidTick, askTick, liq, poolHash));
        require(success);
        
        (basePaid, quotePaid,
         curve.curve_.liq_.ambientSeed_,
         curve.curve_.liq_.concentrated_) = 
            abi.decode(output, (int128, int128, uint128, uint128));
    }
    
    /* @notice Invokes burnRange() call in MicroPaths sidecar and relays the result. */
    function callBurnRange (CurveCache.Cache memory curve,
                            int24 bidTick, int24 askTick, uint128 liq,
                            bytes32 poolHash) internal
        returns (int128 basePaid, int128 quotePaid) {
        
        (bool success, bytes memory output) = microPath_.delegatecall
            (abi.encodeWithSignature
             ("burnRange(uint128,int24,uint128,uint128,uint64,uint64,int24,int24,uint128,bytes32)",
              curve.curve_.priceRoot_, curve.pullPriceTick(),
              curve.curve_.liq_.ambientSeed_, curve.curve_.liq_.concentrated_,
              curve.curve_.accum_.ambientGrowth_, curve.curve_.accum_.concTokenGrowth_,
              bidTick, askTick, liq, poolHash));
        require(success);
        
        (basePaid, quotePaid,
         curve.curve_.liq_.ambientSeed_,
         curve.curve_.liq_.concentrated_) = 
            abi.decode(output, (int128, int128, uint128, uint128));
    }

    /* @notice Invokes sweepSwap() call in MicroPaths sidecar and relays the result. */
    function callSwap (Chaining.PairFlow memory accum,
                       CurveCache.Cache memory curve,
                       Directives.SwapDirective memory swap,
                       PoolSpecs.PoolCursor memory pool) internal {
        (bool success, bytes memory output) = microPath_.delegatecall
            (abi.encodeWithSignature
             ("sweepSwap((uint128,(uint128,uint128),(uint64,uint64)),int24,(uint8,bool,bool,uint128,uint128),((uint24,uint8,uint16,uint8,address),bytes32))",
              curve.curve_, curve.pullPriceTick(), swap, pool));
        require(success);

        Chaining.PairFlow memory swapFlow;
        (swapFlow, curve.curve_.priceRoot_,
         curve.curve_.liq_.ambientSeed_,
         curve.curve_.liq_.concentrated_,
         curve.curve_.accum_.ambientGrowth_,
         curve.curve_.accum_.concTokenGrowth_) = 
            abi.decode(output, (Chaining.PairFlow, uint128, uint128, uint128,
                                uint64, uint64));

        accum.foldFlow(swapFlow);
    }

}
