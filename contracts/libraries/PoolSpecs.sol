// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;
pragma experimental ABIEncoderV2;

/* @title Pool specification library.
 * @notice Library for defining, querying, and encoding the specifications of the
 *         parameters of a pool type. */
library PoolSpecs {

    /* @notice Specifcations of the parameters of a single pool type. Any given pair
     *         may have many different pool types, each of which may operate as segmented
     *         markets with different underlying behavior to the AMM. 
     *
     * @param schema_ Placeholder that defines the structure of the poolSpecs object in
     *                in storage. Because slots initialize zero, 0 is used for an 
     *                unitialized or disabled pool. 1 is the only currently used schema
     *                (for the below struct), but allows for upgradeability in the future
     *
     * @param feeRate_ The overall fee (liquidity fees + protocol fees inclusive) that
     *            swappers pay to the pool as a fraction of notional. Represented as an 
     *            integer representing hundredths of a basis point. I.e. a 0.25% fee 
     *            would be 2500
     *
     * @param protocolTake_ The fraction of the fee rate that goes to the protocol fee 
     *             (the rest accumulates as a liquidity fee to LPs). Represented in units
     *             of 1/256. Since uint8 can represent up to 255, protocol could take
     *             as much as 99.6% of liquidity fees. However currently the protocol
     *             set function prohibits values above 128, i.e. 50% of liquidity fees. 
     *             (See set ProtocolTakeRate in PoolRegistry.sol)
     *
     * @param tickSize The minimum granularity of price ticks defining a grid, on which 
     *          range orders may be placed. (Outside off-grid price improvement facility.)
     *          For example a value of 50 would mean that range order bounds could only
     *          be placed on every 50th price tick, guaranteeing a minimum separation of
     *          0.005% (50 one basis point ticks) between bump points.
     *
     * @param jitThresh_ Sets the minimum TTL for concentrated LP positions in the pool.
     *                   Represented in units of 10 seconds (as measured by block time)
     *                   E.g. a value of 5 equates to a minimum TTL of 50 seconds.
     *                   Attempts to burn or partially burn an LP position in less than
     *                   N seconds (as measured in block.timestamp) after a position was
     *                   minted (or had its liquidity increased) will revert. If set to
     *                   0, atomically flashed liquidity that mints->burns in the same
     *                   block is enabled.
     *
     * @param knockoutBits_ Defines the parameters for where and how knockout liquidity
     *                      is allowed in the pool. (See KnockoutLiq library for a full
     *                      description of the bit field.)
     *
     * @param oracleFlags_ Bitmap flags to indicate the pool's oracle permission 
     *                     requirements. Current implementation only uses the least 
     *                     significant bit, which if on checks oracle permission on every
     *                     pool related call. Otherwise pool is permissionless. */
    struct Pool {
        uint8 schema_;
        uint16 feeRate_;
        uint8 protocolTake_;
        uint16 tickSize_;
        uint8 jitThresh_;
        uint8 knockoutBits_;
        uint8 oracleFlags_;
    }

    uint8 constant BASE_SCHEMA = 1;
    uint8 constant DISABLED_SCHEMA = 0;

    /* @notice Convenience struct that's used to gather all useful context about on a 
     *         specific pool.
     * @param head_ The full specification for the pool. (See struct Pool comments above.)
     * @param hash_ The keccak256 hash used to encode the full pool location.
     * @param oracle_ The permission oracle associated with this pool (0 if pool is 
     *                permissionless.) */
    struct PoolCursor {
        Pool head_;
        bytes32 hash_;
        address oracle_;
    }


    /* @notice Given a mapping of pools, a base/quote token pair and a pool type index,
     *         copies the pool specification to memory. */
    function queryPool (mapping(bytes32 => Pool) storage pools,
                        address tokenX, address tokenY, uint256 poolIdx)
        internal view returns (PoolCursor memory specs) {
        bytes32 key = encodeKey(tokenX, tokenY, poolIdx);
        Pool memory pool = pools[key];
        address oracle = oracleForPool(poolIdx, pool.oracleFlags_);
        return PoolCursor ({head_: pool, hash_: key, oracle_: oracle});
    }

    /* @notice Given a mapping of pools, a base/quote token pair and a pool type index,
     *         retrieves a storage reference to the pool specification. */
    function selectPool (mapping(bytes32 => Pool) storage pools,
                         address tokenX, address tokenY, uint256 poolIdx)
        internal view returns (Pool storage specs) {
        bytes32 key = encodeKey(tokenX, tokenY, poolIdx);
        return pools[key];
    }

    /* @notice Writes a pool specification for a pair and pool type combination. */
    function writePool (mapping(bytes32 => Pool) storage pools,
                        address tokenX, address tokenY, uint256 poolIdx,
                        Pool memory val) internal {
        bytes32 key = encodeKey(tokenX, tokenY, poolIdx);
        pools[key] = val;
    }

    /* @notice Hashes the key associated with a pool for a base/quote asset pair and
     *         a specific pool type index. */
    function encodeKey (address tokenX, address tokenY, uint256 poolIdx)
        internal pure returns (bytes32) {
        require(tokenX < tokenY);
        return keccak256(abi.encode(tokenX, tokenY, poolIdx));
    }

    /* @notice Returns the permission oracle associated with the pool (or 0 if pool is
     *         permissionless. 
     *
     * @dev    The oracle (if enabled on pool settings) is always deterministically based
     *         on the first 160-bits of the pool type value. This means users can know 
     *         ahead of time if a pool can be oracled by checking the bits in the pool
     *         index. */
    function oracleForPool (uint256 poolIdx, uint8 oracleFlags)
        internal pure returns (address) {
        uint8 ORACLE_ENABLED_MASK = 0x1;
        bool oracleEnabled = (oracleFlags & ORACLE_ENABLED_MASK == 1);
        return oracleEnabled ?
            address(uint160(poolIdx >> 96)) :
            address(0);
    }

    /* @notice Constructs a cryptographically unique virtual address based off a base
     *         address (either virtual or real), and a salt unique to the base address.
     *         Can be used to create synthetic tokens, users, etc.
     *
     * @param base The address of the base root.
     * @param salt A salt unique to the base token tracker contract.
     *
     * @return A synthetic token address corresponding to the specific virtual address. */
    function virtualizeAddress (address base, uint256 salt) internal
        pure returns (address) {
        bytes32 hash = keccak256(abi.encode(base, salt));
        uint160 hashTrail = uint160((uint256(hash) << 96) >> 96);
        return address(hashTrail);
    }
}
