// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import '../libraries/SafeCast.sol';
import '../mixins/StorageLayout.sol';
import '../mixins/LiquidityMining.sol';

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
contract LiquidityMiningPath is LiquidityMining {

    function claimConcentratedRewards (bytes32 poolIdx, int24 lowerTick, int24 upperTick, int24 lowerClaimDelta, int24 upperClaimDelta, uint40 maxLiquidityDepth) public payable {
        claimConcentratedRewards(payable(msg.sender), poolIdx, lowerTick, upperTick, lowerClaimDelta, upperClaimDelta, maxLiquidityDepth);
    }
    
    function claimConcentratedRewards (bytes32 poolIdx, int24 lowerTick, int24 upperTick) public payable {
        claimConcentratedRewards(payable(msg.sender), poolIdx, lowerTick, upperTick);
    }

    function claimAmbientRewards (bytes32 poolIdx) public payable {
        claimAmbientRewards(payable(msg.sender), poolIdx);
    }

    function setRewardsPerLiquiditySecond(uint256 rewardPerLiquiditySecond) public payable {
        require(msg.sender == governance_, "Only callable by governance");
        rewardPerLiquiditySecond_ = rewardPerLiquiditySecond;
        if (rewardPerLiquiditySecondLastSet_ > 0) {
            for (uint32 i = rewardPerLiquiditySecondLastSet_; i < uint32(block.timestamp); i += uint32(MONTH)) {
                rewardPerLiquiditySecondHistory_[i] = rewardPerLiquiditySecond;
            }
        }
        rewardPerLiquiditySecondLastSet_ = uint32((block.timestamp / MONTH) * MONTH);
    }


    /* @notice Used at upgrade time to verify that the contract is a valid Croc sidecar proxy and used
     *         in the correct slot. */
    function acceptCrocProxyRole (address, uint16 slot) public pure returns (bool) {
        return slot == CrocSlots.LIQUIDITY_MINING_PROXY_IDX;
    }
}

