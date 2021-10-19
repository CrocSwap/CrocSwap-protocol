// SPDX-License-Identifier: Unlicenxsed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

/* @title Pool specification library */
library PoolSpecs {

    struct Pool {
        uint24 feeRate_;
        uint8 protocolTake_;
        uint16 tickSize_;
        uint8 priceOracle_;
        address permitOracle_;
    }

    struct PoolCursor {
        Pool head_;
        bytes32 hash_;
    }
    
    function queryPool (mapping(bytes32 => Pool) storage pools,
                        address tokenX, address tokenY, uint256 poolIdx)
        internal view returns (PoolCursor memory specs) {
        bytes32 key = encodeKey(tokenX, tokenY, poolIdx);
        Pool memory pool = pools[key];
        return PoolCursor ({head_: pool, hash_: key});
    }

    function selectPool (mapping(bytes32 => Pool) storage pools,
                         address tokenX, address tokenY, uint256 poolIdx)
        internal view returns (Pool storage specs) {
        bytes32 key = encodeKey(tokenX, tokenY, poolIdx);
        return pools[key];
    }

    function writePool (mapping(bytes32 => Pool) storage pools,
                        address tokenX, address tokenY, uint256 poolIdx,
                        Pool memory val)
        internal returns (Pool memory prev) {
        bytes32 key = encodeKey(tokenX, tokenY, poolIdx);
        prev = pools[key];
        pools[key] = val;
        return prev;
    }

    function encodeKey (address tokenX, address tokenY, uint256 poolIdx)
        internal pure returns (bytes32) {
        require(tokenX < tokenY);
        return keccak256(abi.encode(tokenX, tokenY, poolIdx));
    }

}
