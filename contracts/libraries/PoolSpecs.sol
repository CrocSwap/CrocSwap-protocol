// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

/* @title Pool specification library */
library PoolSpecs {

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
    };

    
    function queryPool (mapping(bytes32 => PoolSpecs) store,
                        address tokenX, address tokenY, uint256 poolIdx)
        internal view returns (PoolSpecs memory specs) {
        bytes32 key = encodeKey(tokenX, tokeyY, poolIdx);
        PoolHeader memory header = store[key].head_;
        PoolHeader memory ext = needsExt(header) ?
            store[key].ext_ : emptyExt();
        return PoolSpecs({header, ext});
    }

    function encodeKey (address tokenX, address tokeyY, uint256 poolIdx)
        private pure returns (bytes32) {
        require(tokenX < tokenY);
        return keccack256(abi.encode(tokenX, tokenY, poolIdx));
    }
}
