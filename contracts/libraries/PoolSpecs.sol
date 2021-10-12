// SPDX-License-Identifier: Unlicenxsed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

/* @title Pool specification library */
library PoolSpecs {

    struct Header {
        uint24 feeRate_;
        uint8 protocolTake_;
        uint16 tickSize_;
        uint8 priceOracle_;
        uint8 extFlags_;
    }

    struct Extended {
        address permitOracle_;
    }
    
    struct Pool {
        Header head_;
        Extended ext_;
    }

    struct PoolCursor {
        Header head_;
        Extended ext_;
        bytes32 hash_;
    }

    
    function queryPool (mapping(bytes32 => Pool) storage pools,
                        address tokenX, address tokenY, uint256 poolIdx)
        internal view returns (PoolCursor memory specs) {
        bytes32 key = encodeKey(tokenX, tokenY, poolIdx);
        Header memory header = pools[key].head_;
        Extended memory ext = needsExt(header) ?
            pools[key].ext_ : emptyExt();
        return PoolCursor ({head_: header, ext_: ext, hash_: key});
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

    function needsExt (Header memory header) private pure returns (bool) {
        return header.extFlags_ != 0;
    }

    function emptyExt() private pure returns (Extended memory specs) {
        return Extended({permitOracle_: address(0)});
    }
}
