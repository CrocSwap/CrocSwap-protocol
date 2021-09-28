// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

/* @title Pool specification library */
library PoolSpec {

    struct PoolHeader {
        uint24 feeRate_;
        uint8 protocolTake_;
        uint16 tickSize_;
        uint8 priceOracle_;
        uint8 authFlags_;
    }

    struct PoolExtended {
        address authOracle_;
    }
    
    struct PoolSpecs {
        PoolHeader head_;
        PoolExtended ext_;
    }

    
    function queryPool (mapping(bytes32 => PoolSpecs) storage pools,
                        address tokenX, address tokenY, uint256 poolIdx)
        internal view returns (PoolSpecs memory specs) {
        bytes32 key = encodeKey(tokenX, tokenY, poolIdx);
        PoolHeader memory header = pools[key].head_;
        PoolExtended memory ext = needsExt(header) ?
            pools[key].ext_ : emptyExt();
        return PoolSpecs ({head_: header, ext_: ext});
    }

    function encodeKey (address tokenX, address tokenY, uint256 poolIdx)
        private pure returns (bytes32) {
        require(tokenX < tokenY);
        return keccak256(abi.encode(tokenX, tokenY, poolIdx));
    }

    function needsExt (PoolHeader memory header) private pure returns (bool) {
        return header.authFlags_ != 0;
    }

    function emptyExt() private pure returns (PoolExtended memory specs) {
        return PoolExtended({authOracle_: address(0)});
    }
}
