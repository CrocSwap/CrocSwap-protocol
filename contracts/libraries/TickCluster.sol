// SPDX-License-Identifier: Unlicensed                                                    

pragma solidity >=0.8.4;

import '../libraries/TickMath.sol';

/* @library Tick cluster library
 * @notice Provides a single convention for defining and determining a "significant" 
 *         multi-tick move. */
library TickCluster {

    /* @notice Given a start and ending tick index determine how many tick clusters
     *         the move crossed. */
    function clusterMove (int24 startTick, int24 endTick) internal pure
        returns (uint24) {
        int24 delta = clusterTick(endTick) - clusterTick(startTick);
        return delta > 0 ? uint24(delta) : uint24(-delta);
    }

    /* @notice Converts a price tick index into a tick cluster index. A cluster index
     *         behaves logically similar to a tick index (maps a range of prices to an
     *         index), but constitutes a wide range than a single basis point. This lets
     *         us determine when a "large" multi-tick move has occured. Usually for
     *         gas-intenstive book-keeping that we don't want to bother for on anything
     *         other than major moves. */
    function clusterTick (int24 tick) internal pure returns (int24) {
        return tick / NEIGHBOR_TICKS;
    }

    /* The current arbitrary convention is to define a tick cluster as 32 ticks. This
     * constitutes a 0.32% price range. Which seems like a reasonable tradeoff between
     * economically significant move but large enough that it only triggers on a small
     * handful of swaps. */
    int24 constant internal NEIGHBOR_TICKS = 32;
}

