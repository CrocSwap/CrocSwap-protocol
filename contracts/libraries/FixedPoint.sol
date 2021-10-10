// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.4.0;

/// @title FixedPoint128
/// @notice A library for handling binary fixed point numbers, see https://en.wikipedia.org/wiki/Q_(number_format)
library FixedPoint {
    uint256 internal constant Q128 = 0x100000000000000000000000000000000;
    uint256 internal constant Q96 = 0x1000000000000000000000000;
    uint256 internal constant Q64 = 0x10000000000000000;
    uint256 internal constant Q48 = 0x1000000000000;
    
    function divQ64 (uint128 x, uint128 y) internal pure returns (uint192) {
        return (uint192(x) << 64) / y;
    }

    function divSqQ64 (uint128 x, uint128 y) internal pure returns (uint256) {
        return (uint192(x) << 64) / (uint256(y)*uint256(y));
    }

    function mulQ64 (uint128 x, uint128 y) internal pure returns (uint192) {
        return uint192((uint256(x) * uint256(y)) >> 64);
    }

    function mulQ48 (uint128 x, uint64 y) internal pure returns (uint144) {
        return uint128((uint256(x) * uint256(y)) >> 48);
    }

    function mulDivDivQ64 (uint128 x, uint128 n, uint128 d1, uint128 d2)
        internal pure returns (uint192) {
        uint192 partTerm = (uint192(x) << 64) / d1;
        return partTerm * n / d2;
    }

    function recipQ64 (uint128 x) internal pure returns (uint128) {
        return uint128(FixedPoint.Q128 / x);
    }
}
