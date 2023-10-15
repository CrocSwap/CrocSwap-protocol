// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import "../libraries/SafeCast.sol";
import "./PositionRegistrar.sol";
import "./StorageLayout.sol";
import "./PoolRegistry.sol";

/* @title Liquidity mining mixin
 * @notice Contains the functions related to liquidity mining claiming. */
contract LiquidityMining is PositionRegistrar {
    uint256 constant WEEK = 604800; // Week in seconds 604800

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
        CurveMath.CurveState memory curve
    ) internal {
        uint32 lastAccrued = timeWeightedWeeklyGlobalConcLiquidityLastSet_[
            poolIdx
        ];
        // Only set time on first call
        if (lastAccrued != 0) {
            uint256 liquidity = curve.concLiq_;
            uint32 time = lastAccrued;
            uint32 currWeek;
            uint32 nextWeek;
            uint32 dt;
            while (time < block.timestamp) {
                currWeek = uint32((time / WEEK) * WEEK);
                nextWeek = uint32(((time + WEEK) / WEEK) * WEEK);
                dt = uint32(
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
        int24 upperTick,
        uint32 timeLimit
    ) internal {
        RangePosition72 storage pos = lookupPosition(
            owner,
            poolIdx,
            lowerTick,
            upperTick
        );
        bytes32 posKey = encodePosKey(owner, poolIdx, lowerTick, upperTick);
        uint32 lastAccrued = timeWeightedWeeklyPositionConcLiquidityLastSet_[
            poolIdx
        ][posKey];
        require(timeLimit >= lastAccrued, "Invalid time limit");
        // Only set time on first call
        if (lastAccrued != 0) {
            uint256 liquidity = pos.liquidity_;
            for (int24 i = lowerTick + 100; i <= upperTick - 100; ++i) {
                uint32 tickTrackingIndex = tickTrackingIndexAccruedUpTo_[poolIdx][posKey][i];
                uint32 origIndex = tickTrackingIndex;
                uint32 numTickTracking = uint32(tickTracking_[poolIdx][i].length);
                uint32 time = lastAccrued;
                uint32 currWeek;
                uint32 nextWeek;
                uint32 dt;
                // Loop through all in-range time spans for the tick or up to the current time (if it is still in range)
                while (time < timeLimit && tickTrackingIndex < numTickTracking) {
                    TickTracking memory tickTracking = tickTracking_[poolIdx][i][tickTrackingIndex];
                    currWeek = uint32((time / WEEK) * WEEK);
                    nextWeek = uint32(((time + WEEK) / WEEK) * WEEK);
                    dt = uint32(
                        nextWeek < timeLimit
                            ? nextWeek - time
                            : timeLimit - time
                    );
                    uint32 tickActiveStart; // Timestamp to use for the liquidity addition
                    uint32 tickActiveEnd;
                    if (tickTracking.enterTimestamp < nextWeek) {
                        // Tick was active before next week, need to add the liquidity
                        if (tickTracking.enterTimestamp < time) {
                            // Tick was already active when last claim happened, only accrue from last claim timestamp
                            tickActiveStart = time;
                        } else {
                            // Tick has become active this week
                            tickActiveStart = tickTracking.enterTimestamp;
                        }
                        if (tickTracking.exitTimestamp == 0) {
                            // Tick still active, do not increase index because we need to continue from here
                            tickActiveEnd = uint32(nextWeek < timeLimit ? nextWeek : timeLimit);
                        } else {
                            // Tick is no longer active
                            if (tickTracking.exitTimestamp <= nextWeek) {
                                // Exit was in this week, continue with next tick
                                tickActiveEnd = tickTracking.exitTimestamp;
                                tickTrackingIndex++;
                                dt = tickActiveEnd - time;
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
        } else {
            for (int24 i = lowerTick + 100; i <= upperTick - 100; ++i) {
                uint32 numTickTracking = uint32(tickTracking_[poolIdx][i].length);
                if (numTickTracking > 0) {
                    if (tickTracking_[poolIdx][i][numTickTracking - 1].exitTimestamp == 0) {
                        // Tick currently active
                        tickTrackingIndexAccruedUpTo_[poolIdx][posKey][i] = numTickTracking - 1;
                    } else {
                        tickTrackingIndexAccruedUpTo_[poolIdx][posKey][i] = numTickTracking;
                    }
                }
            }
        }
        timeWeightedWeeklyPositionConcLiquidityLastSet_[poolIdx][
            posKey
        ] = timeLimit;
    }

    /// @notice Allows user to trigger accrual with a time limit to prevent out-of-gas
    function accrueConcentratedPositionTimeWeightedLiquidity(
        bytes32 poolIdx,
        int24 lowerTick,
        int24 upperTick,
        uint32 timeLimit
    ) internal {
        bytes32 posKey = encodePosKey(msg.sender, poolIdx, lowerTick, upperTick);
        require(timeWeightedWeeklyPositionConcLiquidityLastSet_[poolIdx][posKey] > 0, "Non-existing position");
        accrueConcentratedPositionTimeWeightedLiquidity(
            payable(msg.sender),
            poolIdx,
            lowerTick,
            upperTick,
            timeLimit
        );
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
            upperTick,
            uint32(block.timestamp)
        );
        CurveMath.CurveState memory curve = curves_[poolIdx];
        // Need to do a global accrual in case the current tick was already in range for a long time without any modifications that triggered an accrual
        accrueConcentratedGlobalTimeWeightedLiquidity(poolIdx, curve);
        bytes32 posKey = encodePosKey(owner, poolIdx, lowerTick, upperTick);
        uint256 rewardsToSend;
        for (uint256 i; i < weeksToClaim.length; ++i) {
            uint32 week = weeksToClaim[i];
            require(week + WEEK < block.timestamp, "Week not over yet");
            require(
                !concLiquidityRewardsClaimed_[poolIdx][posKey][week],
                "Already claimed"
            );
            uint256 overallInRangeLiquidity = timeWeightedWeeklyGlobalConcLiquidity_[poolIdx][week];
            if (overallInRangeLiquidity > 0) {
                uint256 inRangeLiquidityOfPosition;
                for (int24 j = lowerTick + 100; j <= upperTick - 100; ++j) {
                    inRangeLiquidityOfPosition += timeWeightedWeeklyPositionInRangeConcLiquidity_[poolIdx][posKey][week][j];
                }
                // Percentage of this weeks overall in range liquidity that was provided by the user times the overall weekly rewards
                rewardsToSend += inRangeLiquidityOfPosition * concRewardPerWeek_[poolIdx][week] / overallInRangeLiquidity;
            }
            concLiquidityRewardsClaimed_[poolIdx][posKey][week] = true;
        }
        if (rewardsToSend > 0) {
            (bool sent, ) = owner.call{value: rewardsToSend}("");
            require(sent, "Sending rewards failed");
        }
    }
}
