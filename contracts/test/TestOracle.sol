
// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.8.4;

import "../libraries/TickMath.sol";
import "../mixins/OracleHist.sol";

contract TestOracleHistory is OracleHistorian {
    using TickMath for uint128;
    
    bytes32 constant POOL_KEY = bytes32(uint256(48594918582));
    History dummy;
    
    function testCheckpoint (uint128 price, uint64 ambientGrowth,
                             uint128 liqSeeds, uint32 nowTime) public {
        CurveMath.CurveState memory curve =
            CurveMath.CurveState({priceRoot_: price,
                        liq_: CurveMath.CurveLiquidity({ambientSeed_: liqSeeds,
                                    concentrated_: 0}),
                        accum_: CurveMath.CurveFeeAccum({
                            ambientGrowth_: ambientGrowth,
                                    concTokenGrowth_: 0})});
        addCheckpoint(POOL_KEY, CurveCache.initCache(curve), nowTime);
    }

    function testCross (uint128 startPrice, uint128 endPrice) public view
        returns (bool) {
        int24 startTick = startPrice.getTickAtSqrtRatio();
        int24 endTick = endPrice.getTickAtSqrtRatio();
        return isOracleEvent(POOL_KEY, startTick, endTick);
    }

    function testSetNext (uint64 nextIndex) public {
        dummy.nextIndex_ = nextIndex;
    }
    
    function testIndex (uint32 nowTime) public view
        returns (uint64 write, uint64 prev, uint64 next) {
        (write, prev, next) = determineIndex(dummy, nowTime);
    }

    function testSafeAccumOver (int56 sum) public pure returns (int56) {
        return safeAccum(sum, type(uint32).max, type(int24).max);
    }

    function testSafeAccumUnder (int56 sum) public pure returns (int56) {
        return safeAccum(sum, type(uint32).max, type(int24).min);
    }

    function getSeriesCapacity() public view returns (uint256) {
        return dummy.series_.length;
    }

    function getCheckpoint (uint64 idx) public view
        returns (OracleHistorian.Checkpoint memory) {
        return queryCheckpoint(POOL_KEY, idx);
    }

    function getLength() public view returns (uint64) {
        return queryLength(POOL_KEY);
    }

}
