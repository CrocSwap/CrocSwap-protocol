// SPDX-License-Identifier: Unlicensed                                                    

pragma solidity >=0.8.4;

import '../libraries/TickMath.sol';

library TickCluster {

    function clusterMove (int24 startTick, int24 endTick) internal pure
        returns (uint24) {
        int24 delta = clusterTick(endTick) - clusterTick(startTick);
        return delta > 0 ? uint24(delta) : uint24(-delta);
    }
    
    function clusterTick (int24 tick) internal pure returns (int24) {
        return tick / NEIGHBOR_TICKS;
    }
    
    int24 constant internal NEIGHBOR_TICKS = 32;
}

