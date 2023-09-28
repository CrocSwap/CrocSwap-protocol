// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import "../libraries/SafeCast.sol";
import "../libraries/TickMath.sol";
import "./PositionRegistrar.sol";
import "./StorageLayout.sol";
import "./PoolRegistry.sol";

/* @title Liquidity mining mixin
 * @notice Contains the functions related to liquidity mining claiming. */
contract LiquidityMining is PositionRegistrar {
    uint256 constant WEEK = 604800; // Week in seconds

    /// @notice Initialize the tick tracking for the first tick of a pool
    function initTickTracking(bytes32 poolIdx, int24 tick) internal {
        StorageLayout.TickTracking memory tickTrackingData = StorageLayout
            .TickTracking(uint32(block.timestamp), 0);
        tickTracking_[poolIdx][tick].push(tickTrackingData);
    }

    /// @notice Keeps track of the tick crossings
    /// @dev Needs to be called whenever a tick is crossed
    function crossTicks(
        bytes32 poolIdx,
        int24 exitTick,
        int24 entryTick
    ) internal {
        uint256 numElementsExit = tickTracking_[poolIdx][exitTick].length;
        tickTracking_[poolIdx][exitTick][numElementsExit - 1]
            .exitTimestamp = uint32(block.timestamp);
        StorageLayout.TickTracking memory tickTrackingData = StorageLayout
            .TickTracking(uint32(block.timestamp), 0);
        tickTracking_[poolIdx][entryTick].push(tickTrackingData);
    }

    /// @notice Keeps track of the global in-range time-weighted concentrated liquidity per week
    /// @dev Needs to be called whenever the concentrated liquidity is modified (tick crossed, positions changed)
    function accrueConcentratedGlobalTimeWeightedLiquidity(
        bytes32 poolIdx,
        int24 tick,
        CurveMath.CurveState memory curve
    ) internal {
        uint32 lastAccrued = timeWeightedWeeklyGlobalConcLiquidityLastSet_[
            poolIdx
        ];
        // Only set time on first call
        if (lastAccrued != 0) {
            uint256 liquidity = curve.concLiq_;
            uint32 time = lastAccrued;
            while (time < block.timestamp) {
                uint32 currWeek = uint32((time / WEEK) * WEEK);
                uint32 nextWeek = uint32(((time + WEEK) / WEEK) * WEEK);
                uint32 dt = uint32(
                    nextWeek < block.timestamp
                        ? nextWeek - time
                        : block.timestamp - time
                );
                timeWeightedWeeklyGlobalConcLiquidity_[poolIdx][currWeek] += dt * liquidity;
                time += dt;
            }
        }
        timeWeightedWeeklyGlobalConcLiquidityLastSet_[poolIdx] = uint32(
            block.timestamp
        );
    }

    /// @notice Accrues the in-range time-weighted concentrated liquidity for a position by going over the tick entry / exit history
    /// @dev Needs to be called whenever a position is modified
    function accrueConcentratedPositionTimeWeightedLiquidity(
        address payable owner,
        bytes32 poolIdx,
        int24 lowerTick,
        int24 upperTick
    ) internal {
        RangePosition storage pos = lookupPosition(
            owner,
            poolIdx,
            lowerTick,
            upperTick
        );
        bytes32 posKey = encodePosKey(owner, poolIdx);
        uint32 lastAccrued = timeWeightedWeeklyPositionConcLiquidityLastSet_[
            poolIdx
        ][posKey];
        // Only set time on first call
        if (lastAccrued != 0) {
            uint256 liquidity = pos.liquidity_;
            for (int24 i = lowerTick + 10; i <= upperTick - 10; ++i) {
                uint32 tickTrackingIndex = tickTrackingIndexAccruedUpTo_[poolIdx][posKey][i];
                uint32 origIndex = tickTrackingIndex;
                uint32 numTickTracking = uint32(tickTracking_[poolIdx][i].length);
                uint32 time = lastAccrued;
                // Loop through all in-range time spans for the tick or up to the current time (if it is still in range)
                while (time < block.timestamp && tickTrackingIndex < numTickTracking) {
                    TickTracking memory tickTracking = tickTracking_[poolIdx][i][tickTrackingIndex];
                    uint32 currWeek = uint32((time / WEEK) * WEEK);
                    uint32 nextWeek = uint32(((time + WEEK) / WEEK) * WEEK);
                    uint32 dt = uint32(
                        nextWeek < block.timestamp
                            ? nextWeek - time
                            : block.timestamp - time
                    );
                    uint32 tickActiveStart; // Timestamp to use for the liquidity addition
                    uint32 tickActiveEnd;
                    if (tickTracking.enterTimestamp < nextWeek) {
                        // Tick was active before next week, need to add the liquidity
                        if (tickTracking.enterTimestamp < currWeek) {
                            // Tick was already active before this week
                            tickActiveStart = currWeek;
                        } else {
                            // Tick has become active this week
                            tickActiveStart = tickTracking.enterTimestamp;
                        }
                        if (tickTracking.exitTimestamp == 0) {
                            // Tick still active, do not increase index because we need to continue from here
                            tickActiveEnd = uint32(nextWeek < block.timestamp ? nextWeek : block.timestamp);
                        } else {
                            // Tick is no longer active
                            if (tickTracking.exitTimestamp < nextWeek) {
                                // Exit was in this week, continue with next tick
                                tickActiveEnd = tickTracking.exitTimestamp;
                                tickTrackingIndex++;
                                dt = tickActiveEnd - tickActiveStart;
                            } else {
                                // Exit was in next week, we need to consider the current tick there (i.e. not increase the index)
                                tickActiveEnd = nextWeek;
                            }
                        }
                        timeWeightedWeeklyPositionInRangeConcLiquidity_[poolIdx][posKey][currWeek][i] +=
                            (tickActiveEnd - tickActiveStart) * liquidity;
                    }
                    time += dt;
                }
                if (tickTrackingIndex != origIndex) {
                    tickTrackingIndexAccruedUpTo_[poolIdx][posKey][i] = tickTrackingIndex;
                }
            }
        }
        timeWeightedWeeklyPositionConcLiquidityLastSet_[poolIdx][
            posKey
        ] = uint32(block.timestamp);
    }

    function claimConcentratedRewards(
        address payable owner,
        bytes32 poolIdx,
        int24 lowerTick,
        int24 upperTick,
        uint32[] memory weeksToClaim
    ) internal {
        accrueConcentratedPositionTimeWeightedLiquidity(
            owner,
            poolIdx,
            lowerTick,
            upperTick
        );
        CurveMath.CurveState memory curve = curves_[poolIdx];
        // Need to do a global accrual in case the current tick was already in range for a long time without any modifications that triggered an accrual
        accrueConcentratedGlobalTimeWeightedLiquidity(poolIdx, TickMath.getTickAtSqrtRatio(curve.priceRoot_), curve);
        bytes32 posKey = encodePosKey(owner, poolIdx, lowerTick, upperTick);
        uint256 rewardsToSend;
        for (uint256 i; i < weeksToClaim.length; ++i) {
            uint32 week = weeksToClaim[i];
            require(week + WEEK < block.timestamp, "Week not over yet");
            require(
                !concLiquidityRewardsClaimed_[poolIdx][posKey][week],
                "Already claimed"
            );
            uint256 inRangeLiquidityOfPosition;
            for (int24 j = lowerTick + 10; j <= upperTick - 10; ++j) {
                inRangeLiquidityOfPosition += timeWeightedWeeklyPositionInRangeConcLiquidity_[poolIdx][posKey][week][j];
            }
            uint256 overallInRangeLiquidity = timeWeightedWeeklyGlobalConcLiquidity_[poolIdx][week];
            // Percentage of this weeks overall in range liquidity that was provided by the user times the overall weekly rewards
            rewardsToSend += inRangeLiquidityOfPosition * concRewardPerWeek_[poolIdx][week] / overallInRangeLiquidity;
            concLiquidityRewardsClaimed_[poolIdx][posKey][week] = true;
        }
        if (rewardsToSend > 0) {
            (bool sent, ) = owner.call{value: rewardsToSend}("");
            require(sent, "Sending rewards failed");
        }
    }

    function accrueAmbientGlobalTimeWeightedLiquidity(
        bytes32 poolIdx,
        CurveMath.CurveState memory curve
    ) internal {
        uint32 lastAccrued = timeWeightedWeeklyGlobalAmbLiquidityLastSet_[poolIdx];
        // Only set time on first call
        if (lastAccrued != 0) {
            uint256 liquidity = curve.ambientSeeds_;
            uint32 time = lastAccrued;
            while (time < block.timestamp) {
                uint32 currWeek = uint32((time / WEEK) * WEEK);
                uint32 nextWeek = uint32(((time + WEEK) / WEEK) * WEEK);
                uint32 dt = uint32(
                    nextWeek < block.timestamp
                        ? nextWeek - time
                        : block.timestamp - time
                );
                timeWeightedWeeklyGlobalAmbLiquidity_[poolIdx][currWeek] += dt * liquidity;
                time += dt;
            }
        }
        timeWeightedWeeklyGlobalAmbLiquidityLastSet_[poolIdx] = uint32(
            block.timestamp
        );
    }

    function accrueAmbientPositionTimeWeightedLiquidity(
        address payable owner,
        bytes32 poolIdx
    ) internal {
        bytes32 posKey = encodePosKey(owner, poolIdx);
        uint32 lastAccrued = timeWeightedWeeklyPositionAmbLiquidityLastSet_[
            poolIdx
        ][posKey];
        // Only init time on first call
        if (lastAccrued != 0) {
            AmbientPosition storage pos = lookupPosition(owner, poolIdx);
            uint256 liquidity = pos.seeds_;
            uint32 time = lastAccrued;
            while (time < block.timestamp) {
                uint32 currWeek = uint32((time / WEEK) * WEEK);
                uint32 nextWeek = uint32(((time + WEEK) / WEEK) * WEEK);
                uint32 dt = uint32(
                    nextWeek < block.timestamp
                        ? nextWeek - time
                        : block.timestamp - time
                );
                timeWeightedWeeklyPositionAmbLiquidity_[poolIdx][posKey][
                    currWeek
                ] += dt * liquidity;
                time += dt;
            }
        }
        timeWeightedWeeklyPositionAmbLiquidityLastSet_[poolIdx][
            posKey
        ] = uint32(block.timestamp);
    }

    function claimAmbientRewards(
        address owner,
        bytes32 poolIdx,
        uint32[] memory weeksToClaim
    ) internal {
        CurveMath.CurveState memory curve = curves_[poolIdx];
        accrueAmbientPositionTimeWeightedLiquidity(payable(owner), poolIdx);
        accrueAmbientGlobalTimeWeightedLiquidity(poolIdx, curve);
        bytes32 posKey = encodePosKey(owner, poolIdx);
        uint256 rewardsToSend;
        for (uint256 i; i < weeksToClaim.length; ++i) {
            uint32 week = weeksToClaim[i];
            require(week + WEEK < block.timestamp, "Week not over yet");
            require(
                !ambLiquidityRewardsClaimed_[poolIdx][posKey][week],
                "Already claimed"
            );
            uint256 overallTimeWeightedLiquidity = timeWeightedWeeklyGlobalAmbLiquidity_[
                    poolIdx
                ][week];
            if (overallTimeWeightedLiquidity == 0) continue;
            uint256 rewardsForWeek = (timeWeightedWeeklyPositionAmbLiquidity_[
                poolIdx
            ][posKey][week] * ambRewardPerWeek_[poolIdx][week]) /
                overallTimeWeightedLiquidity;
            rewardsToSend += rewardsForWeek;
            ambLiquidityRewardsClaimed_[poolIdx][posKey][week] = true;
        }
        if (rewardsToSend > 0) {
            (bool sent, ) = owner.call{value: rewardsToSend}("");
            require(sent, "Sending rewards failed");
        }
    }
}
