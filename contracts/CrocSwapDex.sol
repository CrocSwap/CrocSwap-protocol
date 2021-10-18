// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './libraries/PriceGrid.sol';
import './mixins/MarketSequencer.sol';
import './mixins/SettleLayer.sol';
import './mixins/PoolRegistry.sol';
import './mixins/OracleHist.sol';
import './mixins/MarketSequencer.sol';
import './mixins/ColdInjector.sol';
import './interfaces/ICrocSwapHistRecv.sol';
import './callpaths/ColdPath.sol';
import './callpaths/WarmPath.sol';
import './callpaths/HotPath.sol';
import './callpaths/LongPath.sol';
import './callpaths/MicroPaths.sol';

import "hardhat/console.sol";

contract CrocSwapDex is HotPath {

    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;

    constructor (address authority, address coldPath, address warmPath,
                 address longPath, address microPath) {
        authority_ = authority;
        coldPath_ = coldPath;
        warmPath_ = warmPath;
        longPath_ = longPath;
        microPath_ = microPath;
    }

    function trade (bytes calldata input) reEntrantLock public payable {
        callTradePath(input);
    }

    function tradeWarm (bytes calldata input) reEntrantLock public payable {
        callWarmPath(input);
    }

    function initPool (address base, address quote, uint24 poolIdx, uint128 price)
        reEntrantLock public payable {
        callInitPool(base, quote, poolIdx, price);
    }

    function collect (address recv, int128 value, address token)
        reEntrantLock public payable {
        callCollectSurplus(recv, value, token);
    }

    function protocolCmd (bytes calldata input) protocolOnly public {
        callProtocolCmd(input);
    }
}



/* This is a more convenient constructor to call, but the deploy transaction is 100s
 * kb and will get droppped by geth. Useful for testing environments. */
contract CrocSwapDexSeed  is CrocSwapDex {
    
    constructor (address authority)
        CrocSwapDex(authority,
                    address(new ColdPath()),
                    address(new WarmPath()),
                    address(new LongPath()),
                    address(new MicroPaths())) { }
}

