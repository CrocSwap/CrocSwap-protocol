// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import '../libraries/SafeCast.sol';
import '../mixins/StorageLayout.sol';
import '../mixins/PositionRegistrar.sol';

/* @title Liquidity mining callpath sidecar.
 * @notice Defines a proxy sidecar contract that's used to move code outside the 
 *         main contract to avoid Ethereum's contract code size limit. Contains
 *         components related to CANTO liquidity mining.
 * 
 * @dev    This exists as a standalone contract but will only ever contain proxy code,
 *         not state. As such it should never be called directly or externally, and should
 *         only be invoked with DELEGATECALL so that it operates on the contract state
 *         within the primary CrocSwap contract.
 * @dev Since this contract is a proxy sidecar, entrypoints need to be marked
 *      payable even though it doesn't directly handle msg.value. Otherwise it will
 *      fail on any. Because of this, this contract should never be used in any other
 *      context besides a proxy sidecar to CrocSwapDex. */
contract LiquidityMiningPath is StorageLayout, PositionRegistrar {

    
    function claimConcentratedRewards (bytes32 poolIdx, int24 lowerTick, int24 upperTick) public payable { // TODO: User-configurable ranges
        RangePosition storage pos = lookupPosition(msg.sender, poolIdx, lowerTick, upperTick);
        uint256 liquidity = pos.liquidity_;
        require(liquidity > 0, "Position does not exist");
        bytes32 posKey = encodePosKey(msg.sender, poolIdx);
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

    function claimAmbientRewards (bytes32 poolIdx) public payable {
        AmbientPosition storage pos = lookupPosition(msg.sender, poolIdx);
        uint256 liquidity = pos.seeds_;
        require(liquidity > 0, "Position does not exist");
        bytes32 posKey = encodePosKey(msg.sender, poolIdx);
        uint32 lastClaimed = ambLiquidityLastClaimed_[posKey];
        uint32 currTime = SafeCast.timeUint32();
        uint256 rewardsToSend = (currTime - lastClaimed) * rewardPerLiquiditySecond_ * liquidity; // TODO: rewardPerLiquiditySecond_ can change
        ambLiquidityLastClaimed_[posKey] = currTime;
        (bool sent, ) = msg.sender.call{value: rewardsToSend}("");
        require(sent, "Sending rewards failed");
    }


    /* @notice Used at upgrade time to verify that the contract is a valid Croc sidecar proxy and used
     *         in the correct slot. */
    function acceptCrocProxyRole (address, uint16 slot) public pure returns (bool) {
        return slot == CrocSlots.LIQUIDITY_MINING_PROXY_IDX;
    }
}

