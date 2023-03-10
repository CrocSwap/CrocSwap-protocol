// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.19;

/// @title Safe casting methods
/// @notice Contains methods for safely casting between types
library SafeCast {
    /// @notice Cast a uint256 to a uint160, revert on overflow
    /// @param y The uint256 to be downcasted
    /// @return z The downcasted integer, now type uint160
    function toUint160(uint256 y) internal pure returns (uint160 z) {
        unchecked { // Explicit bounds check
        require((z = uint160(y)) == y);
        }
    }
    
    /// @notice Cast a uint256 to a uint128, revert on overflow
    /// @param y The uint256 to be downcasted
    /// @return z The downcasted integer, now type uint128
    function toUint128(uint256 y) internal pure returns (uint128 z) {
        unchecked { // Explicit bounds check
        require((z = uint128(y)) == y);
        }
    }

    /// @notice Cast a uint192 to a uint128, revert on overflow
    /// @param y The uint192 to be downcasted
    /// @return z The downcasted integer, now type uint128
    function toUint128By192(uint192 y) internal pure returns (uint128 z) {
        unchecked { // Explicit bounds check
        require((z = uint128(y)) == y);
        }
    }

    /// @notice Cast a uint144 to a uint128, revert on overflow
    /// @param y The uint144 to be downcasted
    /// @return z The downcasted integer, now type uint128
    function toUint128By144(uint144 y) internal pure returns (uint128 z) {
        unchecked{ // Explicit bounds check
        require((z = uint128(y)) == y);
        }
    }
    
    /// @notice Cast a uint128 to a int128, revert on overflow
    /// @param y The uint128 to be casted
    /// @return z The casted integer, now type int128
    function toInt128Sign(uint128 y) internal pure returns (int128 z) {
        unchecked { // Explicit bounds check
        require(y < 2**127);
        return int128(y);
        }
    }

    // Unix timestamp can fit into 32-bits until the year 2106. After which, internally
    // stored timestamps will stop increasing. Deployed contracts relying on this function
    // should be re-evaluated before that date.
    function timeUint32() internal view returns (uint32) {
        unchecked { // Explicit bounds check
        uint time = block.timestamp;
        if (time > type(uint32).max) { return type(uint32).max; }
        return uint32(time);
        }
    }
}
