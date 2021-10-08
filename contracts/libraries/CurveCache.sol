// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import './CurveMath.sol';
import './TickMath.sol';

/* @title Curve calculation caching library */
library CurveCache {
    using TickMath for uint128;
    using CurveMath for CurveMath.CurveState;

    struct Cache {
        CurveMath.CurveState curve_;
        bool isTickDirty_;
        int24 unsafePriceTick_;
    }

    function initCache (CurveMath.CurveState memory curve) internal pure
        returns (Cache memory cache) {
        cache = Cache({curve_: curve, isTickDirty_: true,
                    unsafePriceTick_: 0 });
    }
    
    function pullPriceTick (Cache memory cache) internal pure returns (int24) {
        if (cache.isTickDirty_) {
            cache.unsafePriceTick_ = cache.curve_.priceRoot_.getTickAtSqrtRatio();
            cache.isTickDirty_ = false;
        }
        return cache.unsafePriceTick_;
    }

    function dirtyPrice (Cache memory cache) internal pure {
        cache.isTickDirty_ = true;
    }
}
