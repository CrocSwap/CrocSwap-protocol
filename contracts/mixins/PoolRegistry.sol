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
                              address permitOracle) public protocolOnly {
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
    
    /*function setProtocolTake (address base, address quote, uint24 poolIdx,
                              uint8 protocolTake) protocolOnly public {
        selectPool(base, quote, poolIdx).head_.protocolTake_ = protocolTake;        
    }

    function setPriceImprove (address token, uint128 unitTickCollateral,
                              uint16 awayTickTol, int8[] calldata rangeMults)
        protocolOnly public {
        improves_[token] = PriceGrid.formatSettings(true, unitTickCollateral,
                                                    awayTickTol, rangeMults);
                                                    }*/

    function registerPool (address base, address quote, uint24 poolIdx) internal
        returns (PoolSpecs.PoolCursor memory) {
        PoolSpecs.Pool memory template = queryTemplate(base, quote, poolIdx);
        PoolSpecs.writePool(pools_, base, quote, poolIdx, template);
        return queryPool(base, quote, poolIdx);
    }

    function queryPriceImprove (Directives.PriceImproveReq memory req,
                                address baseToken, address quoteToken)
        internal view returns (PriceGrid.ImproveSettings memory) {
        if (!req.isEnabled_) {
            return PriceGrid.emptySettings();
        } else if (req.useBaseSide_) {
            return queryPriceImprove(baseToken, true);
        } else {
            return queryPriceImprove(quoteToken, false);
        }
    }
    
    function queryPriceImprove (address token, bool onBaseSide)
        internal view returns (PriceGrid.ImproveSettings memory settings) {
        settings = improves_[token];
        settings.inBase_ = onBaseSide;
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
