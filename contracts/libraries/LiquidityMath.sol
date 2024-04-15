// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

import './SafeCast.sol';
import './TickMath.sol';

/// @title Math library for liquidity
library LiquidityMath {
    /// @notice Add a signed liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function addDelta(uint128 x, int128 y) internal pure returns (uint128 z) {
        unchecked { // Arithmetic checks done explicitly
        if (y < 0) {
            require((z = x - uint128(-y)) < x);
        } else {
            require((z = x + uint128(y)) >= x);
        }
        }
    }

    /// @notice Add an unsigned liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function addLiq(uint128 x, uint128 y) internal pure returns (uint128 z) {
        unchecked { // Arithmetic checks done explicitly
        require((z = x + y) >= x);
        }
    }

    /// @notice Add an unsigned liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function addLots(uint96 x, uint96 y) internal pure returns (uint96 z) {
        unchecked { // Arithmetic checks done explicitly
        require((z = x + y) >= x);
        }
    }

    /// @notice Subtract an unsigned liquidity delta to liquidity and revert if it overflows or underflows
    /// @param x The liquidity before change
    /// @param y The delta by which liquidity should be changed
    /// @return z The liquidity delta
    function minusDelta(uint128 x, uint128 y) internal pure returns (uint128 z) {
        z = x - y;
    }

    /* @notice Same as minusDelta, but operates on lots of liquidity rather than outright
     *         liquiidty. */
    function minusLots(uint96 x, uint96 y) internal pure returns (uint96 z) {
        z = x - y;
    }

    /* In certain contexts we need to represent liquidity, but don't have the full 128 
     * bits or precision. The compromise is to use "lots" of liquidity, which is liquidity
     * represented as multiples of 1024. Usually in those contexts, max lots is capped at
     * 2^96 (equivalent to 2^106 of liquidity.) 
     *
     * More explanation, along with examples can be found in the documentation at 
     * docs/LiquidityLots.md in the project respository. */
    uint16 constant LOT_SIZE = 1024;
    uint8 constant LOT_SIZE_BITS = 10;
    

    /* By utilizing the least significant digit of the liquidity lots value, we can 
     * support special types of "knockout" liquidity, that when crossed trigger specific
     * calls. The aggregate knockout liquidity will always sum to an odd number of lots
     * whereas all vanilla resting liquidity will have an even number of lots. That
     * means we can test whether any level has knockout liquidity simply by seeing if the
     * the total sum is an odd number. 
     *
     * More explanation, along with examples can be found in the documentation at 
     * docs/LiquidityLots.md in the project respository. */
    uint96 constant KNOCKOUT_FLAG_MASK = 0x1;
    uint8 constant LOT_ACTIVE_BITS = 11;

    /* @notice Converts raw liquidity to lots of resting liquidity. (See comment above 
     *         defining lots. */
    function liquidityToLots (uint128 liq) internal pure returns (uint96) {
            uint256 lots = liq >> LOT_SIZE_BITS;
            uint256 liqTrunc = lots << LOT_SIZE_BITS;
            bool hasEmptyMask = (lots & KNOCKOUT_FLAG_MASK == 0);
            require(hasEmptyMask &&
                    liqTrunc == liq &&
                    lots < type(uint96).max, "FD");
            return uint96(lots);
    }

    /* @notice Checks if an aggergate lots counter contains a knockout liquidity component
     *         by checking the least significant bit.
     *
     * @dev    Note that it's critical that the sum *total* of knockout lots on any
     *         given level be an odd number. Don't add two odd knockout lots together
     *         without renormalzing, because they'll sum to an even lot quantity. */
    function hasKnockoutLiq (uint96 lots) internal pure returns (bool) {
        return lots & KNOCKOUT_FLAG_MASK > 0;
    }

    /* @notice Truncates an existing liquidity quantity into a quantity that's a multiple
     *         of the 2048-multiplier defining even-sized lots of liquidity. */
    function shaveRoundLots (uint128 liq) internal pure returns (uint128) {
        return (liq >> LOT_ACTIVE_BITS) << LOT_ACTIVE_BITS;
    }

    /* @notice Truncates an existing liquidity quantity into a quantity that's a multiple
     *         of the 2048-multiplier defining even-sized lots of liquidity, but rounds up 
     *         to the next multiple of 2048. */
    function shaveRoundLotsUp (uint128 liq) internal pure returns (uint128 result) {
        unchecked {
        require((liq & 0xfffffffffffffffffffffffffffff800) != 0xfffffffffffffffffffffffffffff800, "overflow");

        // By shifting down 11 bits, adding the one will always fit in 128 bits
        uint128 roundUp = (liq >> LOT_ACTIVE_BITS) + 1;
        return (roundUp << LOT_ACTIVE_BITS);
        }
    }

    /* @notice Given a number of lots of liquidity converts to raw liquidity value. */
    function lotsToLiquidity (uint96 lots) internal pure returns (uint128) {
        uint96 realLots = lots & ~KNOCKOUT_FLAG_MASK;
        return uint128(realLots) << LOT_SIZE_BITS;
    }

    /* @notice Given a positive and negative delta lots value net out the raw liquidity
     *         delta. */
    function netLotsOnLiquidity (uint96 incrLots, uint96 decrLots) internal pure
        returns (int128) {
        unchecked {
        // Original values are 96-bits, every possible difference will fit in signed-128 bits
        return lotToNetLiq(incrLots) - lotToNetLiq(decrLots);
        }
    }

    /* @notice Given an amount of lots of liquidity converts to a signed raw liquidity
     *         delta. (Which by definition is always positive.) */
    function lotToNetLiq (uint96 lots) internal pure returns (int128) {
        return int128(lotsToLiquidity(lots));
    }

    
    /* @notice Blends the weighted average of two fee reward accumulators based on the
     *         relative size of two liquidity position.
     *
     * @dev To be conservative in terms of rewards/collateral, this function always
     *   rounds up to 2 units of precision. We need mileage rounded up, so reward payouts
     *   are rounded down. However this could lead to the technically "impossible" 
     *   situation where the mileage on a subsequent rewards burn is smaller than the
     *   blended mileage in the liquidity postion. Technically this shouldn't happen 
     *   because mileage only increases through time. However this is a non-consequential
     *   failure. burnPosLiq() just treats it as a zero reward situation, and the staker
     *   loses an economically non-meaningful amount of rewards on the burn. */
    function blendMileage (uint64 mileageX, uint128 liqX, uint64 mileageY, uint128 liqY)
        internal pure returns (uint64) {
        if (liqY == 0) { return mileageX; }
        if (liqX == 0) { return mileageY; }
        if (mileageX == mileageY) { return mileageX; }
        uint64 termX = calcBlend(mileageX, liqX, liqX + liqY);
        uint64 termY = calcBlend(mileageY, liqY, liqX + liqY);

        // With mileage we want to be conservative on the upside. Under-estimating
        // mileage means overpaying rewards. So, round up the fractional weights.
        return (termX + 1) + (termY + 1);
    }

    /* @notice Blends the weighted average of two 72-bit fee reward accumulators based on the
     *         relative size of two liquidity position.
     * 
     * @dev See dev notes from blendMileage() method. Same logic applies. */
    function blendMileage72 (uint72 mileageX, uint128 liqX, uint72 mileageY, uint128 liqY)
        internal pure returns (uint72) {
        if (liqY == 0) { return mileageX; }
        if (liqX == 0) { return mileageY; }
        if (mileageX == mileageY) { return mileageX; }
        uint72 termX = calcBlend72(mileageX, liqX, liqX + liqY);
        uint72 termY = calcBlend72(mileageY, liqY, liqX + liqY);

        // With mileage we want to be conservative on the upside. Under-estimating
        // mileage means overpaying rewards. So, round up the fractional weights.
        return (termX + 1) + (termY + 1);
    }
    
    /* @notice Calculates a weighted blend of adding incremental rewards mileage. */
    function calcBlend (uint64 mileage, uint128 weight, uint128 total)
        private pure returns (uint64) {
        unchecked { // Intermediate results will always fit in 256-bits
        // Can safely cast, because result will always be smaller than original since
        // weight is less than total.
        return uint64(uint256(mileage) * uint256(weight) / uint256(total));
        }
    }

    /* @notice Calculates a weighted blend of adding incremental rewards mileage. */
    function calcBlend72 (uint72 mileage, uint128 weight, uint128 total)
        private pure returns (uint72) {
        unchecked { // Intermediate results will always fit in 256-bits
        // Can safely cast, because result will always be smaller than original since
        // weight is less than total.
        return uint72(uint256(mileage) * uint256(weight) / uint256(total));
        }
    }


    /* @dev Computes a rounding safe calculation of the accumulated rewards rate based on
     *      a beginning and end mileage counter. */
    function deltaRewardsRate (uint64 feeMileage, uint64 oldMileage) internal pure
        returns (uint64) {
        uint64 REWARD_ROUND_DOWN = 2;
        if (feeMileage > oldMileage + REWARD_ROUND_DOWN) {
            return feeMileage - oldMileage - REWARD_ROUND_DOWN;
        } else {
            return 0;
        }
    }

    /* @dev Computes a rounding safe calculation of the accumulated rewards for 72 bit mileage
     *      delta snapshots. */
    function deltaRewardsRate72 (uint72 feeMileage, uint72 oldMileage) internal pure
        returns (uint64) {
        uint72 REWARD_ROUND_DOWN = 2;
        if (feeMileage > oldMileage + REWARD_ROUND_DOWN) {    
            uint72 mileageDelta = feeMileage - oldMileage - REWARD_ROUND_DOWN;

            // In practice a the cumulative growth in a curve, and therefore in any range,
            // in the curve can never exceed 2^64. So in practice this mileage delta should
            // never exceed 2^64. However, to be on the safe side we cap it to prevent
            // overflow.
            return mileageDelta > type(uint64).max ?
                type(uint64).max : uint64(mileageDelta);

        } else {
            return 0;
        }
    }
}
