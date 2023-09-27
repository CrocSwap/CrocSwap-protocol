// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import "../libraries/SafeCast.sol";
import "./PositionRegistrar.sol";
import "./StorageLayout.sol";
import "./PoolRegistry.sol";

/* @title Liquidity mining mixin
 * @notice Contains the functions related to liquidity mining claiming. */
contract LiquidityMining is PositionRegistrar {
    uint256 constant WEEK = 604800; // Week in seconds

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
                timeWeightedWeeklyGlobalConcLiquidityPerTick_[poolIdx][
                    currWeek
                ][tick] += dt * liquidity;
                timeWeightedWeeklyGlobalConcLiquidity_[poolIdx][currWeek] +=
                    dt *
                    liquidity;
                time += dt;
            }
        }
        timeWeightedWeeklyGlobalConcLiquidityLastSet_[poolIdx] = uint32(
            block.timestamp
        );
    }

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
                uint32 time = lastAccrued;
                while (time < block.timestamp) {
                    uint32 currWeek = uint32((time / WEEK) * WEEK);
                    uint32 nextWeek = uint32(((time + WEEK) / WEEK) * WEEK);
                    uint32 dt = uint32(
                        nextWeek < block.timestamp
                            ? nextWeek - time
                            : block.timestamp - time
                    );
                    timeWeightedWeeklyPositionConcLiquidity_[poolIdx][posKey][
                        currWeek
                    ][i] += dt * liquidity;
                    time += dt;
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
        bytes32 posKey = encodePosKey(owner, poolIdx, lowerTick, upperTick);
        RangePosition storage pos = lookupPosition(
            owner,
            poolIdx,
            lowerTick,
            upperTick
        );
        uint256 rewardsToSend;
        for (uint256 i; i < weeksToClaim.length; ++i) {
            bool firstIteration = true;
            uint32 week = weeksToClaim[i];
            require(week + WEEK < block.timestamp, "Week not over yet");
            require(
                !concLiquidityRewardsClaimed_[poolIdx][posKey][week],
                "Already claimed"
            );
            uint256 overallTimeWeightedLiquidity = timeWeightedWeeklyGlobalConcLiquidity_[
                    poolIdx
                ][week];
            uint256 rewardsForWeek;
            for (int24 j = lowerTick + 10; j <= upperTick - 10; ++j) {
                if (firstIteration)
                    accrueConcentratedGlobalTimeWeightedLiquidity(
                        poolIdx,
                        j,
                        curve
                    );
                uint256 perTick = timeWeightedWeeklyGlobalConcLiquidityPerTick_[
                    poolIdx
                ][week][j];
                if (perTick == 0) continue;
                // % of time-weighted liquidity for this tick that was provided by user times overall time-weighted liquidity
                rewardsForWeek +=
                    (timeWeightedWeeklyPositionConcLiquidity_[poolIdx][posKey][
                        week
                    ][j] * overallTimeWeightedLiquidity) /
                    perTick;
            }
            // % of the overall time-weighted liquidity that was provided by user times the reward for this week
            rewardsForWeek =
                (rewardsForWeek * concRewardPerWeek_[poolIdx][week]) /
                overallTimeWeightedLiquidity;
            rewardsToSend += rewardsForWeek;
            concLiquidityRewardsClaimed_[poolIdx][posKey][week] = true;
            firstIteration = false;
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
        uint32 lastAccrued = timeWeightedWeeklyGlobalAmbLiquidityLastSet_[
            poolIdx
        ];
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
                timeWeightedWeeklyGlobalAmbLiquidity_[poolIdx][currWeek] +=
                    dt *
                    liquidity;
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
        AmbientPosition storage pos = lookupPosition(owner, poolIdx);
        uint256 liquidity = pos.seeds_;
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
            ambLiquidityRewardsClaimed_[poolIdx][posKey][week] = true;
        }
        if (rewardsToSend > 0) {
            (bool sent, ) = owner.call{value: rewardsToSend}("");
            require(sent, "Sending rewards failed");
        }
    }
}
