// SPDX-License-Identifier: Unlicensed 

pragma solidity >=0.8.4;

import '../libraries/FullMath.sol';
import '../libraries/SafeCast.sol';
import '../libraries/LiquidityMath.sol';
import '../libraries/LowGasSafeMath.sol';

/* @title Position registrar mixin
 * @notice Tracks the individual positions of liquidity miners, including fee 
 *         accumulation checkpoints for fair distribution of rewards. */
contract PositionRegistrar {
    using LowGasSafeMath for uint64;
    using SafeCast for uint256;

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
    struct Position {
        uint128 liquidity_;
        uint64 feeMileage_;
    }

    mapping(bytes32 => Position) private positions_;

    /* @notice Hashes the owner and concentrated liquidity range to the position key. */
    function encodePosKey (address owner, uint8 poolIdx, int24 lowerTick, int24 upperTick)
        internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner, poolIdx, lowerTick, upperTick));
    }

    /* @notice Returns the current position associated with the owner/range. If nothing
     *         exists the result will have zero liquidity. */
    function lookupPosition (address owner, uint8 poolIdx, int24 lowerTick,
                             int24 upperTick)
        internal view returns (Position storage) {
        return lookupPosKey(encodePosKey(owner, poolIdx, lowerTick, upperTick));
    }

    /* @notice Returns the current position state associated with the hashed position
     *         key. If nothing exists result will have zero liquidity. */
    function lookupPosKey (bytes32 posKey)
        internal view returns (Position storage) {
        return positions_[posKey];
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
    function burnPosLiq (address owner, uint8 poolIdx, int24 lowerTick, int24 upperTick,
                         uint128 burnLiq, uint64 feeMileage)
        internal returns (uint64 rewards) {
        Position storage pos = lookupPosition(owner, poolIdx, lowerTick, upperTick);
        uint128 liq = pos.liquidity_;
        uint64 oldMileage = pos.feeMileage_;
        uint128 nextLiq = LiquidityMath.minusDelta(liq, burnLiq);

        // Technically feeMileage should never be less than oldMileage, but we need to
        // handle it because it can happen due to fixed-point effects. (See blendMileage()
        // function.)
        if (feeMileage > oldMileage) {
            rewards = feeMileage - oldMileage;
            // No need to adjust the position's mileage checkpoint. Rewards are in per
            // unit of liquidity, so the pro-rata rewards of the remaining liquidity
            // (if any) remain unnaffected. 
        }
        pos.liquidity_ = nextLiq;
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
    function addPosLiq (address owner, uint8 poolIdx, int24 lowerTick, int24 upperTick,
                        uint128 liqAdd, uint64 feeMileage) internal {
        Position storage pos = lookupPosition(owner, poolIdx, lowerTick, upperTick);
        uint128 liq = pos.liquidity_;
        uint64 oldMileage;

        if (liq > 0) {
            oldMileage = pos.feeMileage_;
        } else {
            oldMileage = 0;
        }

        // Save an SSTORE if there's no mileage change
        if (feeMileage != oldMileage) {
            pos.feeMileage_ = blendMileage(feeMileage, liqAdd, oldMileage, liq);
        }
        pos.liquidity_ = LiquidityMath.addDelta(liq, liqAdd);
    }

    /* @dev To be conservative in terms of rewards/collateral, this function always
     *   rounds up to 2 units of precision. We need mileage rounded up, so reward payouts
     *   are rounded down. However this could lead to the technically "impossible" 
     *   situation where the mileage on a subsequent rewards burn is smaller than the
     *   blended mileage in the liquidity postion. Technically this shouldn't happen 
     *   because mileage only increases through time. However this is a non-consequential
     *   failure. burnPosLiq() just treats it as a zero reward situation, and the staker
     *   loses an economically non-meaningful amount of rewards on the burn. */
    function blendMileage (uint64 mileageX, uint128 liqX, uint64 mileageY, uint liqY)
        private pure returns (uint64) {
        if (liqY == 0) { return mileageX; }
        if (liqX == 0) { return mileageY; }
        uint64 termX = FullMath.mulDiv(mileageX, liqX, liqX + liqY).toUint64();
        uint64 termY = FullMath.mulDiv(mileageY, liqY, liqX + liqY).toUint64();

        // With mileage we want to be conservative on the upside. Under-estimating
        // mileage means overpaying rewards. So, round up the fractional weights.
        termX = termX + 1;
        termY = termY + 1;
        return termX + termY;
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
    function changePosOwner (address owner, address receiver, uint8 poolIdx, 
                             int24 lowerTick, int24 upperTick) internal {
        Position storage pos = lookupPosition(owner, poolIdx, lowerTick, upperTick);
        Position storage newPos = lookupPosition(receiver, poolIdx, lowerTick, upperTick);

        // For now we only allow transfers to positions with uninitialized liquidity.
        // Otherwise the fee mileage on the existing liquidity will be set incorrectly.
        require(newPos.liquidity_ == 0, "G");
        newPos.liquidity_ = pos.liquidity_;
        newPos.feeMileage_ = pos.feeMileage_;
        pos.liquidity_ = 0;
    }
}
