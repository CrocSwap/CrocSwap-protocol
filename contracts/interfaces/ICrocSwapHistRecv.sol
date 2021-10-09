// SPDX-License-Identifier: Unlicensed 

pragma solidity >=0.8.4;

import '../libraries/CurveCache.sol';

interface ICrocSwapHistRecv {

    function checkpointHist (bytes32 poolKey, int24 startTick,
                             CurveCache.Cache memory curve) external;
    function initHist (bytes32 poolKey, CurveCache.Cache memory curve) external;
}
