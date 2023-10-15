// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import "../libraries/SafeCast.sol";
import "../mixins/StorageLayout.sol";
import "../mixins/LiquidityMining.sol";
import "../libraries/ProtocolCmd.sol";

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
    /* @notice Consolidated method for protocol control related commands. 
     *         Used to set reward rates */
    function protocolCmd(bytes calldata cmd) public virtual {
        (uint8 code, bytes32 poolHash, uint32 weekFrom, uint32 weekTo, uint64 weeklyReward) =
            abi.decode(cmd, (uint8, bytes32, uint32, uint32, uint64));

        if (code == ProtocolCmd.SET_CONC_REWARDS_CODE) {
            setConcRewards(poolHash, weekFrom, weekTo, weeklyReward);
        } else {
            revert("Invalid protocol command");
        }
    }

    /* @notice Consolidated method for user commands.
     *         Used for claiming liquidity mining rewards. */
    function userCmd(bytes calldata input) public payable {
        (uint8 code, bytes32 poolHash, int24 lowerTick, int24 upperTick, uint32[] memory weeksToClaim, uint32 timeLimit)
        = abi.decode(input, (uint8, bytes32, int24, int24, uint32[], uint32));

        if (code == UserCmd.CLAIM_CONC_REWARDS_CODE) {
            claimConcentratedRewards(poolHash, lowerTick, upperTick, weeksToClaim);
        } else if (code == UserCmd.ACCRUE_CONC_POSITION_CODE) {
            accrueConcentratedPositionTimeWeightedLiquidity(poolHash, lowerTick, upperTick, timeLimit);
        } else {
            revert("Invalid user command");
        }
    }

    function claimConcentratedRewards(bytes32 poolIdx, int24 lowerTick, int24 upperTick, uint32[] memory weeksToClaim)
        public
        payable
    {
        claimConcentratedRewards(payable(msg.sender), poolIdx, lowerTick, upperTick, weeksToClaim);
    }

    function setConcRewards(bytes32 poolIdx, uint32 weekFrom, uint32 weekTo, uint64 weeklyReward) public payable {
        // require(msg.sender == governance_, "Only callable by governance");
        require(weekFrom % WEEK == 0 && weekTo % WEEK == 0, "Invalid weeks");
        while (weekFrom <= weekTo) {
            concRewardPerWeek_[poolIdx][weekFrom] = weeklyReward;
            weekFrom += uint32(WEEK);
        }
    }

    /* @notice Used at upgrade time to verify that the contract is a valid Croc sidecar proxy and used
     *         in the correct slot. */
    function acceptCrocProxyRole(address, uint16 slot) public pure returns (bool) {
        return slot == CrocSlots.LIQUIDITY_MINING_PROXY_IDX;
    }
}
