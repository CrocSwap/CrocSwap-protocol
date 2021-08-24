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

    mapping(bytes32 => Position) private positions_;

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

            // Gas optimization. No point wasting an SSTORE if we're
            // fully burning the position.
            if (nextLiq > 0) {
                pos.feeMileage_ = feeMileage;
            }
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

        if (feeMileage > oldMileage) {
            pos.feeMileage_ = feeMileage;
        }
        pos.liquidity_ = LiquidityMath.addDelta(liq, liqAdd);
    }
}
