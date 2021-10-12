// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';
import '../libraries/PoolSpecs.sol';
import '../libraries/PriceGrid.sol';
import '../interfaces/ICrocSwapPermitOracle.sol';
import './StorageLayout.sol';

import "hardhat/console.sol";

contract PoolRegistry is StorageLayout {

    using PoolSpecs for PoolSpecs.Pool;

    function verifyPermit (PoolSpecs.PoolCursor memory pool,
                           address base, address quote,
                           Directives.PoolDirective memory dir) view internal {
        if (pool.ext_.permitOracle_ != address(0)) {
            bool approved = ICrocSwapPermitOracle(pool.ext_.permitOracle_)
                .isApprovedForCrocPool(msg.sender, base, quote, dir);
            require(approved, "Z");
        }
    }
    
    function setPoolTemplate (uint24 poolIdx, uint24 feeRate,
                              uint8 protocolTake, uint16 tickSize,
                              address permitOracle) internal {
        PoolSpecs.Pool storage templ = templates_[poolIdx];
        templ.head_.feeRate_ = feeRate;
        templ.head_.protocolTake_ = protocolTake;
        templ.head_.tickSize_ = tickSize;
        templ.head_.priceOracle_ = 0;
        templ.head_.extFlags_ = formExtFlags(permitOracle);
        templ.ext_.permitOracle_ = permitOracle;
    }

    function formExtFlags (address permitOracle) private pure returns (uint8) {
        return (permitOracle != address(0)) ? 1 : 0;
    }
    
    function setPoolSpecs (address base, address quote, uint24 poolIdx,
                           uint24 feeRate, uint8 protocolTake,
                           uint16 tickSize) internal {
        PoolSpecs.Pool storage pool = selectPool(base, quote, poolIdx);
        pool.head_.feeRate_ = feeRate;
        pool.head_.protocolTake_ = protocolTake;
        pool.head_.tickSize_ = tickSize;
    }

    /*function setPriceImprove (address token, uint128 unitTickCollateral,
                              uint16 awayTickTol, int8[] calldata rangeMults)
        protocolOnly internal {
        improves_[token] = PriceGrid.formatSettings(true, unitTickCollateral,
                                                    awayTickTol, rangeMults);
                                                    }*/

    function registerPool (address base, address quote, uint24 poolIdx) internal
        returns (PoolSpecs.PoolCursor memory) {
        
        PoolSpecs.Pool memory template = queryTemplate(base, quote, poolIdx);
        PoolSpecs.writePool(pools_, base, quote, poolIdx, template);
        return queryPool(base, quote, poolIdx);
    }

    function queryPriceImprove (PriceGrid.ImproveSettings memory dest,
                                Directives.PriceImproveReq memory req,
                                address base, address quote) view internal {
        if (req.isEnabled_) {
            address token = req.useBaseSide_ ? base : quote;
            dest = improves_[token];
            dest.inBase_ = req.useBaseSide_;
        }
    }

    function queryPool (address base, address quote, uint24 poolIdx)
        internal view returns (PoolSpecs.PoolCursor memory pool) {
        pool = PoolSpecs.queryPool(pools_, base, quote, poolIdx);
        require(isPoolInit(pool), "PI");
    }

    function selectPool (address base, address quote, uint24 poolIdx)
        internal view returns (PoolSpecs.Pool storage pool) {
        pool = PoolSpecs.selectPool(pools_, base, quote, poolIdx);
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
}
