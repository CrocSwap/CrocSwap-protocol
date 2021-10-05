// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';
import '../libraries/Encoding.sol';
import '../libraries/PoolSpecs.sol';

import "hardhat/console.sol";

contract PoolRegistry {

    using PoolSpecs for PoolSpecs.Pool;

    function setPoolTemplate (uint24 poolIdx, uint24 feeRate,
                              uint8 protocolTake, uint16 tickSize) public authOnly {
        PoolSpecs.Header memory head = PoolSpecs.Header({feeRate_: feeRate,
                    protocolTake_: protocolTake, tickSize_: tickSize,
                    priceOracle_: 0, authFlags_: 0});
        PoolSpecs.Extended memory ext = PoolSpecs.Extended({authOracle_: address(0)});
        PoolSpecs.Pool memory pool = PoolSpecs.Pool({head_: head, ext_: ext});
        templates_[poolIdx] = pool;
    }

    function registerPool (address base, address quote, uint24 poolIdx) internal
        returns (PoolSpecs.PoolCursor memory) {
        PoolSpecs.Pool memory template = queryTemplate(base, quote, poolIdx);
        PoolSpecs.writePool(pools_, base, quote, poolIdx, template);
        return queryPool(base, quote, poolIdx);
    }

    function queryPool (address base, address quote, uint24 poolIdx)
        internal view returns (PoolSpecs.PoolCursor memory pool) {
        pool = PoolSpecs.queryPool(pools_, base, quote, poolIdx);
        require(isPoolInit(pool), "PI");
    }

    function queryTemplate (address, address, uint24 poolIdx)
        private view returns (PoolSpecs.Pool memory template) {
        template = templates_[poolIdx];
        require(isPoolInit(template), "PT");
    }

    function isPoolInit (PoolSpecs.Pool memory pool)
        private pure returns (bool) {
        return pool.head_.tickSize_ > 0;
    }

    function isPoolInit (PoolSpecs.PoolCursor memory pool)
        private pure returns (bool) {
        return pool.head_.tickSize_ > 0;
    }

    function setPoolAuthority (address authority) internal {
        authority_ = authority;
    }

    modifier authOnly() {
        require(msg.sender == authority_);
        _;
    }

    mapping(uint24 => PoolSpecs.Pool) private templates_;
    mapping(bytes32 => PoolSpecs.Pool) private pools_;
    address private authority_;
}
