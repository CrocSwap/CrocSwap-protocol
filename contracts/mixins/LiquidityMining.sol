// SPDX-License-Identifier: GPL-3 

pragma solidity 0.8.19;

import '../libraries/SafeCast.sol';
import './PositionRegistrar.sol';
import './StorageLayout.sol';
import './PoolRegistry.sol';

/* @title Liquidity mining mixin
 * @notice Contains the functions related to liquidity mining claiming. */
contract LiquidityMining is PositionRegistrar {

    function claimConcentratedRewards (address payable owner, bytes32 poolIdx, int24 lowerTick, int24 upperTick) internal { // TODO: User-configurable ranges
        RangePosition storage pos = lookupPosition(owner, poolIdx, lowerTick, upperTick);
        uint256 liquidity = pos.liquidity_;
        require(liquidity > 0, "Position does not exist");
        bytes32 posKey = encodePosKey(owner, poolIdx);
        uint256 secondsActiveRange;
        for (int24 i = lowerTick + 10; i <= upperTick - 10; ++i) {
            uint32[] storage tickEnterTimestamps = tickEnterTimestamps_[poolIdx][i];
            uint32[] storage tickExitTimestamps = tickExitTimestamps_[poolIdx][i];
            uint256 numTimestamps = tickExitTimestamps.length;
            uint40 claimedUpTo = concLiquidityClaimedUpTo_[posKey][i];
            for (uint40 j = claimedUpTo; j < numTimestamps; ++j) {
                uint32 secondsActiveTick = tickExitTimestamps[j] - tickEnterTimestamps[j];
                secondsActiveRange += secondsActiveTick;
            }
            concLiquidityClaimedUpTo_[posKey][i] = uint40(numTimestamps);
        }
    }

    function claimAmbientRewards (address owner, bytes32 poolIdx) internal {
        AmbientPosition storage pos = lookupPosition(owner, poolIdx);
        uint256 liquidity = pos.seeds_;
        require(liquidity > 0, "Position does not exist");
        bytes32 posKey = encodePosKey(owner, poolIdx);
        uint32 lastClaimed = ambLiquidityLastClaimed_[posKey];
        uint32 currTime = SafeCast.timeUint32();
        uint256 rewardsToSend = (currTime - lastClaimed) * rewardPerLiquiditySecond_ * liquidity; // TODO: rewardPerLiquiditySecond_ can change
        ambLiquidityLastClaimed_[posKey] = currTime;
        (bool sent, ) = owner.call{value: rewardsToSend}("");
        require(sent, "Sending rewards failed");
    }
}
