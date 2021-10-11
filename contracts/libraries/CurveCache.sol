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
        bool isTickClean_;
        int24 unsafePriceTick_;
    }
    
    function pullPriceTick (Cache memory cache) internal pure returns (int24) {
        if (!cache.isTickClean_) {
            cache.unsafePriceTick_ = cache.curve_.priceRoot_.getTickAtSqrtRatio();
            cache.isTickClean_ = true;
        }
        return cache.unsafePriceTick_;
    }

    function dirtyPrice (Cache memory cache) internal pure {
        cache.isTickClean_ = false;
    }

    function plugTick (Cache memory cache, int24 tick) internal pure {
        cache.isTickClean_ = true;
        cache.unsafePriceTick_ = tick;
    }
}
