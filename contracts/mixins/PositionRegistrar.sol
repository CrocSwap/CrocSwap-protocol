// SPDX-License-Identifier: Unlicensed 

pragma solidity >0.7.1;

import '../libraries/FullMath.sol';
import '../libraries/FixedPoint128.sol';
import '../libraries/LiquidityMath.sol';
import '../libraries/LowGasSafeMath.sol';

/* @title Position registrar mixin
 * @notice Tracks the individual positions of liquidity miners, including fee 
 *         accumulation checkpoints for fair distribution of rewards. */
contract PositionRegistrar {
    using LowGasSafeMath for uint256;

    /* The five things we need to know for each concentrated liquidity position are:
     *    1) Owner
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
        uint256 feeMileage_;
    }

    /* A position's liquidity must be larger than the estimated gas cost induced
    by crossing a tick divided by this value in order to hold an intermediate tick
    position. */
    uint128 private itmdLiqRat_;

    mapping(bytes32 => Position) private positions_;

    // The estimated marginal gas utilized when crossing a single tick. #TODO Move to gas fetch
    uint128 constant private TICK_CROSS_GAS_EST = 1;

    /* @notice Hashes the owner and concentrated liquidity range to the position key. */
    function encodePosKey (address owner, int24 lowerTick, int24 upperTick)
        public pure returns (bytes32) {
        return keccak256(abi.encodePacked(owner, lowerTick, upperTick));
    }

    /* @notice Returns the current position associated with the owner/range. If nothing
     *         exists the result will have zero liquidity. */
    function lookupPosition (address owner, int24 lowerTick, int24 upperTick)
        internal view returns (Position storage) {
        return lookupPosKey(encodePosKey(owner, lowerTick, upperTick));
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
    function burnPosLiq (address owner, int24 lowerTick, int24 upperTick,
                         uint128 burnLiq, uint256 feeMileage)
        internal returns (uint256 rewards) {
        Position storage pos = lookupPosition(owner, lowerTick, upperTick);
        uint128 liq = pos.liquidity_;
        uint256 oldMileage = pos.feeMileage_;
        uint128 nextLiq = LiquidityMath.minusDelta(liq, burnLiq);

        if (feeMileage > oldMileage) {
            rewards = feeMileage.sub(oldMileage);
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
     * @param lowerTick The 24-bit tick index constituting the lower range of the 
     *                  concentrated liquidity position.
     * @param upperTick The 24-bit tick index constituting the upper range of the 
     *                  concentrated liquidity position.
     * @param liqAdd The amount of liquidity to add to the position. If no liquidity 
     *               previously exists, position will be created.
     * @param feeMileage The up-to-date fee mileage associated with the range. If the
     *                   position will be checkpointed with this value. */
    function addPosLiq (address owner, int24 lowerTick, int24 upperTick,
                        uint128 liqAdd, uint256 feeMileage) internal {
        Position storage pos = lookupPosition(owner, lowerTick, upperTick);
        uint128 liq = pos.liquidity_;
        uint256 oldMileage;

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
    
    function blendMileage (uint256 mileageX, uint128 liqX, uint256 mileageY, uint liqY)
        private pure returns (uint256) {
        if (liqY == 0) { return mileageX; }
        if (liqX == 0) { return mileageY; }
        uint256 termX = FullMath.mulDiv(mileageX, liqX, liqX + liqY);
        uint256 termY = FullMath.mulDiv(mileageY, liqY, liqX + liqY);

        // With mileage we want to be conservative on the upside. Under-estimating
        // mileage means overpaying rewards. So, round up the fractional weights.
        termX = termX + 1;
        termY = termY + 1;
        return termX + termY;
    }

    /* @notice Changes the owner of an existing position without altering its properties
     *         in any other way. This has no impact from an aggregate liquidity and fee
     *         accumulation standpoint, and can otherwise be ignored downstream.
     * @param owner The address which currently owns the position.
     * @param receiver The address that ownership is being transferred to.
     * @param lowerTick The tick index of the lower boundary of the position. This
     *                  does *not* change during the ownership process.
     * @param upperTick The tick index of the upper boundary of the position. This
     *                  does *not* change during the ownership process. */
    function changePosOwner (address owner, address receiver,
                             int24 lowerTick, int24 upperTick) internal {
        Position storage pos = lookupPosition(owner, lowerTick, upperTick);
        Position storage newPos = lookupPosition(receiver, lowerTick, upperTick);

        // For now we only allow transfers to positions with uninitialized liquidity.
        // Otherwise the fee mileage on the existing liquidity will be set incorrectly.
        require(newPos.liquidity_ == 0, "G");
        newPos.liquidity_ = pos.liquidity_;
        newPos.feeMileage_ = pos.feeMileage_;
        pos.liquidity_ = 0;
    }

    /* @notice Returns the value multiplied by a position's liquidity when deciding if a
    *          position's liquidity justifies its utilization of an intermediate tick. */
    function getItmdLiqRat() internal view returns (uint128) {
        return itmdLiqRat_;
    }

    /* @notice Sets the value multiplied by a position's liquidity when deciding if a
    *          position's liquidity justifies its utilization of an intermediate tick. 
    *          Changing this value does not immediately remove intermedaite tick 
    *          positions that formerly satisfied the threshold. */
    function setItmdLiqRat (uint128 itmdLiqRat) internal {
        require(itmdLiqRat >= 0 && itmdLiqRat < type(uint128).max);
        itmdLiqRat_ = uint128(itmdLiqRat_);
    }

    /* @notice Returns the amount of liquidity required of a position justify the expected aditional
               gas cost generated by an intermediate tick. */
    function getIntermediateTickLiqThreshold () internal view returns (uint256) {
        return 5;
        // return FullMath.mulDiv(TICK_CROSS_GAS_EST, 1, itmdLiqRat_);
    }
    
    /* @notice Returns the new liquidity of an intermediate tick position after a modification. Returns 0
    *          if the position fails to exceed the intermediate tick threshold.
    * @param owner The address owning the position.
    * @param lowerTick The 24-bit tick index constituting the lower range of the 
    *                  concentrated liquidity position.
    * @param upperTick The 24-bit tick index constituting the upper range of the 
    *                  concentrated liquidity position.
    * @param deltaLiq  The absolute value of the liquidity being added to the position.
    * @param burn      A boolean representing if deltaLiq is being burned or minted. */
    function itmdTickNewLiq (address owner, int24 lowerTick, int24 upperTick, uint128 deltaLiq, bool burn) internal view returns (bool, uint128) {
        Position storage pos = lookupPosition(owner, lowerTick, upperTick);
        uint128 prevLiq = pos.liquidity_;
        uint128 newLiq = burn ? prevLiq - deltaLiq : prevLiq + deltaLiq;

        return (newLiq > getIntermediateTickLiqThreshold(), prevLiq);
    }
}
