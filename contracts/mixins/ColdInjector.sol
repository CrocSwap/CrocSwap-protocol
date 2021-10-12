// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './StorageLayout.sol';
import '../libraries/CurveCache.sol';
import '../libraries/Chaining.sol';
import '../libraries/Directives.sol';

import "hardhat/console.sol";

contract ColdPathInjector is StorageLayout {
    using CurveCache for CurveCache.Cache;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;
    
    function callInitPool (address base, address quote, uint24 poolIdx,  
                           uint128 price) internal {
        (bool success, ) = coldPath_.delegatecall(
            abi.encodeWithSignature
            ("initPool(address,address,uint24,uint128)",
             base, quote, poolIdx, price));
        require(success);
    }

    function callSetTemplate (uint24 poolIdx, uint24 feeRate,
                              uint8 protocolTake, uint16 tickSize,
                              address permitOracle) internal {
        (bool success, ) = coldPath_.delegatecall(
            abi.encodeWithSignature
            ("setTemplate(uint24,uint24,uint8,uint16,address)",
             poolIdx, feeRate, protocolTake, tickSize, permitOracle));
        require(success);
    }

    function callPegPriceImprove (address token, uint128 collateral, uint16 away)
        internal {
        (bool success, ) = coldPath_.delegatecall(
            abi.encodeWithSignature
            ("pegPriceImprove(address,uint128,uint16)",
             token, collateral, away));
        require(success);
    }
    
    function callRevisePool (address base, address quote, uint24 poolIdx,
                             uint24 feeRate, uint8 protocolTake, uint16 tickSize)
        internal {
        (bool success, ) = coldPath_.delegatecall(
            abi.encodeWithSignature
            ("revisePool(address,address,uint24,uint24,uint8,uint16)",
             base, quote, poolIdx, feeRate, protocolTake, tickSize));
        require(success);
    }

    function callTradePath (bytes calldata input) internal {
        (bool success, ) = longPath_.delegatecall(
            abi.encodeWithSignature("trade(bytes)", input));
        require(success);
    }

    function callMintPath (address base, address quote, uint24 poolIdx, int24 bidTick,
                           int24 askTick, uint128 liq) internal {
        (bool success, ) = longPath_.delegatecall(
            abi.encodeWithSignature("mint(address,address,uint24,int24,int24,uint128)",
                                    base, quote, poolIdx, bidTick, askTick, liq));
        require(success);
    }

    function callBurnPath (address base, address quote, uint24 poolIdx, int24 bidTick,
                           int24 askTick, uint128 liq) internal {
        (bool success, ) = longPath_.delegatecall(
            abi.encodeWithSignature("burn(address,address,uint24,int24,int24,uint128)",
                                    base, quote, poolIdx, bidTick, askTick, liq));
        require(success);
    }

    function callMintPath (address base, address quote, uint24 poolIdx,
                           uint128 liq) internal {
        (bool success, ) = longPath_.delegatecall(
            abi.encodeWithSignature("mint(address,address,uint24,uint128)",
                                    base, quote, poolIdx, liq));
        require(success);
    }

    function callBurnPath (address base, address quote, uint24 poolIdx,
                           uint128 liq) internal {
        (bool success, ) = longPath_.delegatecall(
            abi.encodeWithSignature("burn(address,address,uint24,uint128)",
                                    base, quote, poolIdx, liq));
        require(success);
    }


    
    function callMintAmbient (CurveCache.Cache memory curve, uint128 liq,
                              bytes32 poolHash) internal
        returns (int128 basePaid, int128 quotePaid) {
        (bool success, bytes memory output) = microPath_.delegatecall
            (abi.encodeWithSignature
             ("mintAmbient(uint128,uint128,uint128,uint64,uint64,uint128,bytes32)",
              curve.curve_.priceRoot_, 
              curve.curve_.liq_.ambientSeed_,
              curve.curve_.liq_.concentrated_,
              curve.curve_.accum_.ambientGrowth_, curve.curve_.accum_.concTokenGrowth_,
              liq, poolHash));
        require(success);
        
        (basePaid, quotePaid,
         curve.curve_.liq_.concentrated_) = 
            abi.decode(output, (int128, int128, uint128));
    }

    function callBurnAmbient (CurveCache.Cache memory curve, uint128 liq,
                              bytes32 poolHash) internal
        returns (int128 basePaid, int128 quotePaid) {

        (bool success, bytes memory output) = microPath_.delegatecall
            (abi.encodeWithSignature
             ("burnAmbient(uint128,uint128,uint128,uint64,uint64,uint128,bytes32)",
              curve.curve_.priceRoot_, 
              curve.curve_.liq_.ambientSeed_,
              curve.curve_.liq_.concentrated_,
              curve.curve_.accum_.ambientGrowth_, curve.curve_.accum_.concTokenGrowth_,
              liq, poolHash));
        require(success);
        
        (basePaid, quotePaid,
         curve.curve_.liq_.ambientSeed_,
         curve.curve_.liq_.concentrated_) = 
            abi.decode(output, (int128, int128, uint128, uint128));
    }
    

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

    
    function callSwap (Chaining.PairFlow memory flow,
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

        flow.foldFlow(swapFlow);
    }

}
