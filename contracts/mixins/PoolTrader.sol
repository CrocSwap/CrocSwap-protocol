// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';
import '../libraries/Encoding.sol';
import '../libraries/PoolSpecs.sol';
import './PositionRegistrar.sol';
import './LiquidityCurve.sol';
import './LevelBook.sol';
import './ProtocolAccount.sol';

import "hardhat/console.sol";

contract PoolTrader is 
    PositionRegistrar, LiquidityCurve, LevelBook, ProtocolAccount {

    using PoolSpecs for PoolSpecs.Pool;

    function tradeOverPool (address base, address quote,
                            Directives.PoolDirective memory dir)
        internal returns (int256 baseFlow, int256 quoteFlow) {
        PoolSpecs.PoolCursor memory pool =
            PoolSpecs.queryPool(pools_, base, quote, dir.poolIdx_);

        CurveMath.CurveState memory curve = snapCurve(pool.hash_);
        (baseFlow, quoteFlow) = applyToCurve(dir, pool, curve);
        commitCurve(pool.hash_, curve);
    }

    function applyToCurve (Directives.PoolDirective memory dir,
                           PoolSpecs.PoolCursor memory pool,
                           CurveMath.CurveState memory curve)
        private view returns (int256 baseFlow, int256 quoteFlow) {
        
    }

    mapping(bytes32 => PoolSpecs.Pool) private pools_;
}
