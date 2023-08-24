// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

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

    
    function claimConcentratedRewards (bytes32 poolIdx, int24 lowerTick, int24 upperTick) public payable {
        RangePosition storage pos = lookupPosition(msg.sender, poolIdx, lowerTick, upperTick);
    }

    function claimAmbientRewards (bytes32 poolIdx) public payable {
        AmbientPosition storage pos = lookupPosition(msg.sender, poolIdx);
        require(pos.seeds_ > 0, "Position does not exist");
        bytes32 posKey = encodePosKey(msg.sender, poolIdx);
        uint32 lastClaimed = ambLiquidityLastClaimed_[posKey];
        uint32 currTime = uint32(block.timestamp);
        uint256 rewardsToSend = (currTime - lastClaimed) * rewardPerLiquiditySecond_; // TODO: rewardPerLiquiditySecond_ can change
        ambLiquidityLastClaimed_[posKey] = uint32(block.timestamp);
        (bool sent, ) = msg.sender.call{value: rewardsToSend}("");
        require(sent, "Sending rewards failed");
    }


    /* @notice Used at upgrade time to verify that the contract is a valid Croc sidecar proxy and used
     *         in the correct slot. */
    function acceptCrocProxyRole (address, uint16 slot) public pure returns (bool) {
        return slot == CrocSlots.LIQUIDITY_MINING_PROXY_IDX;
    }
}

