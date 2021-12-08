// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.5.0;

/// @title Safe casting methods
/// @notice Contains methods for safely casting between types
library SafeCast {
    /// @notice Cast a uint256 to a uint160, revert on overflow
    /// @param y The uint256 to be downcasted
    /// @return z The downcasted integer, now type uint160
    function toUint160(uint256 y) internal pure returns (uint160 z) {
        require((z = uint160(y)) == y);
    }
    
    /// @notice Cast a uint256 to a uint128, revert on overflow
    /// @param y The uint256 to be downcasted
    /// @return z The downcasted integer, now type uint128
    function toUint128(uint256 y) internal pure returns (uint128 z) {
        require((z = uint128(y)) == y);
    }

    /// @notice Cast a uint192 to a uint128, revert on overflow
    /// @param y The uint182 to be downcasted
    /// @return z The downcasted integer, now type uint128
    function toUint128By192(uint192 y) internal pure returns (uint128 z) {
        require((z = uint128(y)) == y);
    }

    /// @notice Cast a uint144 to a uint128, revert on overflow
    /// @param y The uint144 to be downcasted
    /// @return z The downcasted integer, now type uint128
    function toUint128By144(uint144 y) internal pure returns (uint128 z) {
        require((z = uint128(y)) == y);
    }

    /// @notice Cast a uint256 to a uint64, revert on overflow
    /// @param y The uint64 to be downcasted
    /// @return z The downcasted integer, now type uint64
    function toUint64(uint256 y) internal pure returns (uint64 z) {
        require((z = uint64(y)) == y);
    }

    /// @notice Cast a uint128 to a uint8, revert on overflow
    /// @param y The uint128 to be downcasted
    /// @return z The downcasted integer, now type uint8
    function toUint8(uint128 y) internal pure returns (uint8 z) {
        require((z = uint8(y)) == y);
    }

    /// @notice Cast a int256 to a int128, revert on overflow or underflow
    /// @param y The int256 to be downcasted
    /// @return z The downcasted integer, now type int128
    function toInt128(int256 y) internal pure returns (int128 z) {
        require((z = int128(y)) == y);
    }

    
    /// @notice Cast a uint128 to a int128, revert on overflow
    /// @param y The uint128 to be casted
    /// @return z The casted integer, now type int128
    function toInt128Sign(uint128 y) internal pure returns (int128 z) {
        require(y < 2**127);
        return int128(y);
    }

    /// @notice Cast a uint256 to a int256, revert on overflow
    /// @param y The uint256 to be casted
    /// @return z The casted integer, now type int256
    function toInt256(uint256 y) internal pure returns (int256 z) {
        require(y < 2**255);
        z = int256(y);
    }

    /// @notice Cast a int256 to a uint256, revert on overflow or underflow
    /// @param y The int256 to be downcasted
    /// @return z The downcasted integer, now type uint256
    function toUint256(int256 y) internal pure returns (uint256 z) {
        require(y >= 0);
        z = uint256(y);
    }

    // Unix timestamp can fit into 32-bits until 2038. After which, the worse case
    // is timestamps stop increasing. Since the timestamp is only used for informational
    // purposes, this doesn't affect the functioning of the core smart contract.
    function timeUint32() internal view returns (uint32) {
        uint time = block.timestamp;
        if (time > type(uint32).max) { return type(uint32).max; }
        return uint32(time);
    }

    // @notice Converts a uint128 to a uint64, capping the result to max(uint64) if the
    //         original value overflows.
    function capUint64 (uint128 x) internal pure returns (uint64) {
        if (x >= type(uint64).max) {
            return type(uint64).max;
        }
        return uint64(x);
    }
}
