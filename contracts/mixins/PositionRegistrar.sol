// SPDX-License-Identifier: Unlicensed 

pragma solidity >=0.8.4;

import '../libraries/SafeCast.sol';
import '../libraries/LiquidityMath.sol';
import '../libraries/LowGasSafeMath.sol';
import '../libraries/CompoundMath.sol';
import './StorageLayout.sol';

import "hardhat/console.sol";

/* @title Position registrar mixin
 * @notice Tracks the individual positions of liquidity miners, including fee 
 *         accumulation checkpoints for fair distribution of rewards. */
contract PositionRegistrar is StorageLayout {
    using LowGasSafeMath for uint64;
    using SafeCast for uint256;
    using CompoundMath for uint128;
    using LiquidityMath for uint128;

    /* The six things we need to know for each concentrated liquidity position are:
     *    1) Owner
     *    2) The pool the position's on.
     *    2) Lower tick bound on the range
     *    3) Upper tick bound on the range
     *    4) Total liquidity
     *    5) Fee accumulation mileage for the position's range checkpointed at the last
     *       update. Used to correctly distribute in-range liquidity rewards.
     * Of these 1-3 constitute the unique key. If a user adds a new position with the
     * same owner and the same range, it can be represented by incrementing 4 and 
     * updating 5. */

    /* @notice Hashes the owner and concentrated liquidity range to the position key. */
    function encodePosKey (address owner, bytes32 poolIdx)
        internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner, poolIdx));
    }

    /* @notice Hashes the owner and concentrated liquidity range to the position key. */
    function encodePosKey (address owner, bytes32 poolIdx,
                           int24 lowerTick, int24 upperTick)
        internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner, poolIdx, lowerTick, upperTick));
    }

    /* @notice Returns the current position associated with the owner/range. If nothing
     *         exists the result will have zero liquidity. */
    function lookupPosition (address owner, bytes32 poolIdx, int24 lowerTick,
                             int24 upperTick)
        internal view returns (RangePosition storage) {
        return positions_[encodePosKey(owner, poolIdx, lowerTick, upperTick)];
    }

    /* @notice Returns the current position associated with the owner's ambient 
     *         position. If nothing exists the result will have zero liquidity. */
    function lookupPosition (address owner, bytes32 poolIdx)
        internal view returns (AmbientPosition storage) {
        return ambPositions_[encodePosKey(owner, poolIdx)];
    }

    /* @notice Removes all or some liquidity associated with a position. Calculates
     *         the cumulative rewards since last update, and updates the fee mileage
     *         (if position still have active liquidity).
     *
     * @param owner The address owning the position.
     * @param poolIdx The index of the pool the position belongs to
     * @param lowerTick The 24-bit tick index constituting the lower range of the 
     *                  concentrated liquidity position.
     * @param upperTick The 24-bit tick index constituting the upper range of the 
     *                  concentrated liquidity position.
     * @param burnLiq The amount of liquidity to remove from the position. Caller is
     *                is responsible for making sure the position has at least this much
     *                liquidity in place.
     * @param feeMileage The up-to-date fee mileage associated with the range. If the
     *                   position is still active after this call, this new value will
     *                   be checkpointed on the position.
     *
     * @return rewards The rewards accumulated between the current and last checkpoined
     *                 fee mileage. */
    function burnPosLiq (address owner, bytes32 poolIdx, int24 lowerTick,
                         int24 upperTick, uint128 burnLiq, uint64 feeMileage)
        internal returns (uint64) {
        RangePosition storage pos = lookupPosition(owner, poolIdx, lowerTick, upperTick);
        return decrementLiq(pos, burnLiq, feeMileage);
    }

    function burnPosLiq (address owner, bytes32 poolIdx, uint128 burnLiq,
                         uint64 ambientGrowth)
        internal returns (uint128 burnSeeds) {
        AmbientPosition storage pos = lookupPosition(owner, poolIdx);
        burnSeeds = burnLiq.deflateLiqSeed(ambientGrowth);
        uint128 nextSeeds = pos.seeds_.minusDelta(burnSeeds);
        if (nextSeeds == 0) {
            // Solidity optimizer should convert this to a single refunded SSTORE
            pos.seeds_ = 0;
            pos.timestamp_ = 0;
        } else {
            pos.seeds_ = nextSeeds;
            // Decreasing liquidity does not lose time priority
        }
    }

    function decrementLiq (RangePosition storage pos,
                           uint128 burnLiq, uint64 feeMileage) internal returns
        (uint64 rewards) {
        uint128 liq = pos.liquidity_;
        uint64 oldMileage = pos.feeMileage_;

        uint128 nextLiq = LiquidityMath.minusDelta(liq, burnLiq);

        // Technically feeMileage should never be less than oldMileage, but we need to
        // handle it because it can happen due to fixed-point effects.
        // (See blendMileage() function.)
        if (feeMileage > oldMileage) {
            rewards = feeMileage - oldMileage;
            // No need to adjust the position's mileage checkpoint. Rewards are in per
            // unit of liquidity, so the pro-rata rewards of the remaining liquidity
            // (if any) remain unnaffected. 
        }
        
        if (nextLiq > 0) {
            pos.liquidity_ = nextLiq;
        } else {
            // Solidity optimizer should convert this to a single refunded SSTORE
            pos.liquidity_ = 0;
            pos.feeMileage_ = 0;
            pos.timestamp_ = 0;
        }
    }
    
    /* @notice Adds liquidity to a given concentrated liquidity position, creating the
     *         position if necessary.
     *
     * @param owner The address owning the position.
     * @param poolIdx The index of the pool the position belongs to
     * @param lowerTick The 24-bit tick index constituting the lower range of the 
     *                  concentrated liquidity position.
     * @param upperTick The 24-bit tick index constituting the upper range of the 
     *                  concentrated liquidity position.
     * @param liqAdd The amount of liquidity to add to the position. If no liquidity 
     *               previously exists, position will be created.
     * @param feeMileage The up-to-date fee mileage associated with the range. If the
     *                   position will be checkpointed with this value. */
    function mintPosLiq (address owner, bytes32 poolIdx, int24 lowerTick,
                         int24 upperTick, uint128 liqAdd, uint64 feeMileage) internal {
        RangePosition storage pos = lookupPosition(owner, poolIdx, lowerTick, upperTick);
        incrementPosLiq(pos, liqAdd, feeMileage);
    }

    function mintPosLiq (address owner, bytes32 poolIdx, uint128 liqAdd,
                         uint64 ambientGrowth) internal {
        AmbientPosition storage pos = lookupPosition(owner, poolIdx);
        uint128 seeds = liqAdd.deflateLiqSeed(ambientGrowth);
        pos.seeds_ = pos.seeds_.addDelta(seeds);
        pos.timestamp_ = SafeCast.timeUint32(); // Increase liquidity loses time priority.
    }

    function incrementPosLiq (RangePosition storage pos, uint128 liqAdd,
                              uint64 feeMileage) private {
        uint128 liq = pos.liquidity_;
        uint64 oldMileage;

        if (liq > 0) {
            oldMileage = pos.feeMileage_;
        } else {
            oldMileage = 0;
        }

        uint128 liqNext = LiquidityMath.addDelta(liq, liqAdd);
        uint64 mileage = blendMileage(feeMileage, liqAdd, oldMileage, liq);
        uint32 stamp = SafeCast.timeUint32();
        
        // Below should get optimized to a single SSTORE...
        pos.liquidity_ = liqNext;
        pos.feeMileage_ = mileage;
        pos.timestamp_ = stamp;
    }

    /* @dev To be conservative in terms of rewards/collateral, this function always
     *   rounds up to 2 units of precision. We need mileage rounded up, so reward payouts
     *   are rounded down. However this could lead to the technically "impossible" 
     *   situation where the mileage on a subsequent rewards burn is smaller than the
     *   blended mileage in the liquidity postion. Technically this shouldn't happen 
     *   because mileage only increases through time. However this is a non-consequential
     *   failure. burnPosLiq() just treats it as a zero reward situation, and the staker
     *   loses an economically non-meaningful amount of rewards on the burn. */
    function blendMileage (uint64 mileageX, uint128 liqX, uint64 mileageY, uint128 liqY)
        private pure returns (uint64) {
        if (liqY == 0) { return mileageX; }
        if (liqX == 0) { return mileageY; }
        if (mileageX == mileageY) { return mileageX; }
        uint64 termX = calcBlend(mileageX, liqX, liqX + liqY);
        uint64 termY = calcBlend(mileageY, liqY, liqX + liqY);

        // With mileage we want to be conservative on the upside. Under-estimating
        // mileage means overpaying rewards. So, round up the fractional weights.
        termX = termX + 1;
        termY = termY + 1;
        return termX + termY;
    }

    function calcBlend (uint64 mileage, uint128 weight, uint128 total)
        private pure returns (uint64) {
        // Can safely cast, because result will always be smaller than origina since
        // weight is less than total.
        return uint64(uint256(mileage) * uint256(weight) / uint256(total));
    }

    
    /* @notice Changes the owner of an existing position without altering its properties
     *         in any other way. This has no impact from an aggregate liquidity and fee
     *         accumulation standpoint, and can otherwise be ignored downstream.
     * @param poolIdx The index of the pool the position belongs to.
     * @param owner The address which currently owns the position.
     * @param receiver The address that ownership is being transferred to.
     * @param lowerTick The tick index of the lower boundary of the position. This
     *                  does *not* change during the ownership process.
     * @param upperTick The tick index of the upper boundary of the position. This
     *                  does *not* change during the ownership process. */
    function changePosOwner (address owner, address receiver, bytes32 poolIdx, 
                             int24 lowerTick, int24 upperTick) internal {
        RangePosition storage pos = lookupPosition(owner, poolIdx, lowerTick, upperTick);
        RangePosition storage newPos = lookupPosition
            (receiver, poolIdx, lowerTick, upperTick);

        // For now we only allow transfers to positions with uninitialized liquidity.
        // Otherwise the fee mileage on the existing liquidity will be set incorrectly.
        require(newPos.liquidity_ == 0, "G");
        newPos.liquidity_ = pos.liquidity_;
        newPos.feeMileage_ = pos.feeMileage_;
        pos.liquidity_ = 0;
    }
}
