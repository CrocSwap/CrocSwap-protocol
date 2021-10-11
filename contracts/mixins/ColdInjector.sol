// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './StorageLayout.sol';
import '../libraries/CurveCache.sol';

import "hardhat/console.sol";

contract ColdPathInjector is StorageLayout {
    using CurveCache for CurveCache.Cache;
    using CurveMath for CurveMath.CurveState;
    
    function callInitPool (address base, address quote, uint24 poolIdx,  
                           uint128 price) internal {
        (bool success, ) = coldPath_.delegatecall(
            abi.encodeWithSignature("initPool(address,address,uint24,uint128)",
                                    base, quote, poolIdx, price));
        require(success);
    }

    function callTradePath (bytes calldata input) internal {
        (bool success, ) = warmPath_.delegatecall(
            abi.encodeWithSignature("trade(bytes)", input));
        require(success);
    }

    function delegateBurnRange (CurveCache.Cache memory curve,
                                int24 bidTick, int24 askTick, uint128 liq,
                                bytes32 poolHash) internal
        returns (int128 basePaid, int128 quotePaid) {
        
        (bool success, bytes memory output) = microPath_.delegatecall
            (abi.encodeWithSignature
             ("burnRange(uint128,uint128,uint128,uint64,uint64,int24,int24,uint128,bytes32)",
              curve.curve_.priceRoot_, curve.curve_.liq_.ambientSeed_,
              curve.curve_.liq_.concentrated_,
              curve.curve_.accum_.ambientGrowth_, curve.curve_.accum_.concTokenGrowth_,
              bidTick, askTick, liq, poolHash));
        require(success, 'DL');
        
        int24 priceTick;
        (basePaid, quotePaid, curve.curve_.liq_.ambientSeed_,
         curve.curve_.liq_.concentrated_, priceTick) = 
            abi.decode(output, (int128, int128, uint128, uint128, int24));
        
        curve.plugTick(priceTick);
    }

}
