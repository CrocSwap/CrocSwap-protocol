// SPDX-License-Identifier: GPL-3 

pragma solidity 0.8.19;

import '../libraries/SafeCast.sol';
import './PositionRegistrar.sol';
import './StorageLayout.sol';
import './PoolRegistry.sol';

/* @title Liquidity mining mixin
 * @notice Contains the functions related to liquidity mining claiming. */
contract LiquidityMining is PositionRegistrar {

    uint256 constant MONTH = 2592000; // Month in seconds (assuming 30 days)

    function claimConcentratedRewards (address payable owner, bytes32 poolIdx, int24 lowerTick, int24 upperTick) internal {
        claimConcentratedRewards(owner, poolIdx, lowerTick, upperTick, 0, 0, 0);
    }

    function claimConcentratedRewards (address payable owner, bytes32 poolIdx, int24 lowerTick, int24 upperTick, int24 lowerClaimDelta, int24 upperClaimDelta, uint40 maxLiquidityDepth) internal {
        RangePosition storage pos = lookupPosition(owner, poolIdx, lowerTick, upperTick);
        uint256 liquidity = pos.liquidity_;
        require(liquidity > 0, "Position does not exist");
        bytes32 posKey = encodePosKey(owner, poolIdx);
        uint256 secondsActiveRangeTimesReward;
        uint256 rewardPerLiquiditySecond = rewardPerLiquiditySecond_;
        for (int24 i = lowerTick + 10 + lowerClaimDelta; i <= upperTick - 10 - upperClaimDelta; ++i) {
            uint32[] storage tickEnterTimestamps = tickEnterTimestamps_[poolIdx][i];
            uint32[] storage tickExitTimestamps = tickExitTimestamps_[poolIdx][i];
            uint256 numTimestamps = tickExitTimestamps.length;
            uint40 claimedUpTo = concLiquidityClaimedUpTo_[posKey][i];
            uint40 claimUpperBoundary = uint40(numTimestamps);
            if (maxLiquidityDepth > 0 && claimedUpTo + maxLiquidityDepth < claimUpperBoundary) claimUpperBoundary = claimedUpTo + maxLiquidityDepth;
            for (uint40 j = claimedUpTo; j < claimUpperBoundary; ++j) {
                uint32 tickEnterTimestamp = tickEnterTimestamps[j];
                uint32 secondsActiveTick = tickExitTimestamps[j] - tickEnterTimestamp;
                // To simplify things, we take the reward of the beginning of the last enter, even if the enter / exit range goes over the month boundary with two different values
                uint256 historicalReward = rewardPerLiquiditySecondHistory_[(tickEnterTimestamp / MONTH) * MONTH];
                if (historicalReward == 0) historicalReward = rewardPerLiquiditySecond;
                secondsActiveRangeTimesReward += secondsActiveTick * historicalReward;
            }
            concLiquidityClaimedUpTo_[posKey][i] = uint40(numTimestamps);
        }
        uint256 rewardsToSend = liquidity * secondsActiveRangeTimesReward;
        (bool sent, ) = owner.call{value: rewardsToSend}("");
        require(sent, "Sending rewards failed");
    }

    function claimAmbientRewards (address owner, bytes32 poolIdx) internal {
        AmbientPosition storage pos = lookupPosition(owner, poolIdx);
        uint256 liquidity = pos.seeds_;
        require(liquidity > 0, "Position does not exist");
        bytes32 posKey = encodePosKey(owner, poolIdx);
        uint32 lastClaimed = ambLiquidityLastClaimed_[posKey];
        uint32 currTime = SafeCast.timeUint32();
        uint256 secondsActiveRangeTimesReward;
        for (uint32 i = lastClaimed; i < currTime; i += uint32(MONTH)) {
            // To simplify things, we take the reward of the beginning of the range, even if the range goes over the month boundary with two different values
            uint256 historicalReward = rewardPerLiquiditySecondHistory_[(i / MONTH) * MONTH];
            if (historicalReward == 0) historicalReward = rewardPerLiquiditySecond_;
            secondsActiveRangeTimesReward += _min(currTime - i, MONTH) * historicalReward;
        }
        ambLiquidityLastClaimed_[posKey] = currTime;
        uint256 rewardsToSend = liquidity * secondsActiveRangeTimesReward;
        (bool sent, ) = owner.call{value: rewardsToSend}("");
        require(sent, "Sending rewards failed");
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
