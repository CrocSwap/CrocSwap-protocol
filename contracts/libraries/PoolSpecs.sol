// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

/* @title Pool specification library.
 * @notice Library for defining, querying, and encoding the specifications of the
 *         parameters of a pool type. */
library PoolSpecs {

    /* @notice Specifcations of the parameters of a single pool type. Any given pair
     *         may have many different pool types, each of which may operate as segmented
     *         markts with different underlying behavior to the AMM. 
     *
     * @param feeRate_ The overall fee (liquidity fees + protocol fees inclusive) that
     *            swappers pay to the pool as a fraction of notional. Represented as an 
     *            integer representing hundredeths of a basis point. I.e. a 0.25% fee 
     *            would be 250000
     * @param protocolTake_ The fraction of the fee rate that goes to the protocol fee 
     *             (the rest accumulates as a liquidity fee to LPs). Represented as 1/n. 
     *             Special case of zero, means the protocol take is 0%.
     * @param tickSize The minimum granularity of price ticks defining a grid, on which 
     *          range orders may be placed. (Outside off-grid price improvement facility.)
     *          For example a value of 50 would mean that range order bounds could only
     *          be placed on every 50th price tick, guaranteeing a minimum separation of
     *          0.005% (50 one basis point ticks) between bump points.
     * @param permitOracle Address pointing to an external smart contract that controls
     *          the permissioned access to the pool. If zero, access to the pool is 
     *          permissionless. */
    struct Pool {
        uint24 feeRate_;
        uint8 protocolTake_;
        uint16 tickSize_;
        uint8 priceOracle_;
        address permitOracle_;
    }

    /* @notice Convenience struct that's used to gather all useful context about on a 
     *         specific pool.
     * @param head_ The full specification for the pool. (See struct Pool comments above.)
     * @param hash_ The keccak256 hash used to encode the full pool location. */
    struct PoolCursor {
        Pool head_;
        bytes32 hash_;
    }

    /* @notice Given a mapping of pools, a base/quote token pair and a pool type index,
     *         copies the pool specification to memory. */
    function queryPool (mapping(bytes32 => Pool) storage pools,
                        address tokenX, address tokenY, uint256 poolIdx)
        internal view returns (PoolCursor memory specs) {
        bytes32 key = encodeKey(tokenX, tokenY, poolIdx);
        Pool memory pool = pools[key];
        return PoolCursor ({head_: pool, hash_: key});
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
                        Pool memory val)
        internal returns (Pool memory prev) {
        bytes32 key = encodeKey(tokenX, tokenY, poolIdx);
        prev = pools[key];
        pools[key] = val;
        return prev;
    }

    /* @notice Hashes the key associated with a pool for a base/quote asset pair and
     *         a specific pool type index. */
    function encodeKey (address tokenX, address tokenY, uint256 poolIdx)
        internal pure returns (bytes32) {
        require(tokenX < tokenY);
        return keccak256(abi.encode(tokenX, tokenY, poolIdx));
    }

}
