// SPDX-License-Identifier: GPL-3
pragma solidity 0.8.19;

/// @title FixedPoint128
/// @notice A library for handling binary fixed point numbers, see https://en.wikipedia.org/wiki/Q_(number_format)
library FixedPoint {
    uint256 internal constant Q128 = 0x100000000000000000000000000000000;
    uint256 internal constant Q96 = 0x1000000000000000000000000;
    uint256 internal constant Q64 = 0x10000000000000000;
    uint256 internal constant Q48 = 0x1000000000000;

    /* @notice Multiplies two Q64.64 numbers by each other. */
    function mulQ64 (uint128 x, uint128 y) internal pure returns (uint192) {
        unchecked { // 128 bit integers squared will always fit in 256-bits
        return uint192((uint256(x) * uint256(y)) >> 64);
        }
    }

    /* @notice Divides one Q64.64 number by another. */
    function divQ64 (uint128 x, uint128 y) internal pure returns (uint192) {
        unchecked { // No overflow or underflow possible in the below operations
        return (uint192(x) << 64) / y;
        }
    }

    /* @notice Multiplies a Q64.64 by a Q16.48. */
    function mulQ48 (uint128 x, uint64 y) internal pure returns (uint144) {
        unchecked { // 128 bit integers squared will always fit in 256-bits
        return uint144((uint256(x) * uint256(y)) >> 48);
        }
    }

    /* @notice Takes the reciprocal of a Q64.64 number. */
    function recipQ64 (uint128 x) internal pure returns (uint128) {
        unchecked { // Only possible overflow possible is captured with a specific check
        uint256 div = uint256(FixedPoint.Q128) / uint256(x);
        require(div <= type(uint128).max);
        return uint128(div);
        }
    }
}
