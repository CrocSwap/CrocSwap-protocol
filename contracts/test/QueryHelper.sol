// SPDX-License-Identifier: Unlicensed                                                     
pragma solidity >=0.8.4;

import "../CrocSwapDex.sol";

contract QueryHelper {
    using CurveMath for CurveMath.CurveState;
    
    address public dex_;
    
    constructor (address dex) {
        dex_ = dex;
    }
    
    function queryCurve (address base, address quote, uint24 poolIdx)
        public view returns (CurveMath.CurveState memory curve) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        (curve.priceRoot_, curve.liq_, curve.accum_) =
            CrocSwapDex(dex_).curves_(poolHash);
        
    }

    function queryLiquidity (address base, address quote, uint24 poolIdx)
        public view returns (uint128) {
        return queryCurve(base, quote, poolIdx).activeLiquidity();
    }
}
