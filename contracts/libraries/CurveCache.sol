// SPDX-License-Identifier: GPL-3

pragma solidity ^0.8.4;
pragma experimental ABIEncoderV2;

import './CurveMath.sol';
import './TickMath.sol';

/* @title Curve caching library.
 * @notice Certain values related to the CurveState aren't stored (to save storage),
 *    but are relatively gas expensive to calculate. As such we want to cache these
 *    calculations in memory whenever possible to avoid duplicated effort. This library
 *    provides a convenient facility for that. */
library CurveCache {
    using TickMath for uint128;
    using CurveMath for CurveMath.CurveState;

    /* @notice Represents the underlying CurveState along with the tick price memory
     *         cache, and associated bookeeping.
     * 
     * @param curve_ The underlying CurveState object.
     * @params isTickClean_ If true, than the current price tick value is valid to use.
     * @params unsafePriceTick_ The prick tick value (if previously cached). User should
     *              not access directly, but use the pullPriceTick() helper function. */
    struct Cache {
        CurveMath.CurveState curve_;
        bool isTickClean_;
        int24 unsafePriceTick_;
    }

    /* @notice Give a curve cache instance retrieves the price tick, if cached, or 
     *         calculates and cached if cache is dirty. */
    function pullPriceTick (Cache memory cache) internal pure returns (int24) {
        if (!cache.isTickClean_) {
            cache.unsafePriceTick_ = cache.curve_.priceRoot_.getTickAtSqrtRatio();
            cache.isTickClean_ = true;
        }
        return cache.unsafePriceTick_;
    }

    /* @notice Call on a curve cache object, when the underlying price has changed, and
     *         thereore the cache should be conisdered dirty. */
    function dirtyPrice (Cache memory cache) internal pure {
        cache.isTickClean_ = false;
    }
}
