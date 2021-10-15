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

    uint8 constant SWAP_ACT_CODE = 1;
    uint8 constant MINT_ACT_CODE = 2;
    uint8 constant BURN_ACT_CODE = 3;
    uint8 constant COMP_ACT_CODE = 4;

    function verifyPermit (PoolSpecs.PoolCursor memory pool,
                           address base, address quote,
                           uint8 actionCode) view internal {
        if (pool.head_.permitOracle_ != address(0)) {
            bool approved = ICrocSwapPermitOracle(pool.head_.permitOracle_)
                .isApprovedForCrocPool(msg.sender, base, quote, actionCode);
            require(approved, "Z");
        }
    }
    
    function setPoolTemplate (uint24 poolIdx, uint24 feeRate,
                              uint8 protocolTake, uint16 tickSize,
                              address permitOracle) internal {
        PoolSpecs.Pool storage templ = templates_[poolIdx];
        templ.feeRate_ = feeRate;
        templ.protocolTake_ = protocolTake;
        templ.tickSize_ = tickSize;
        templ.priceOracle_ = 0;
        templ.permitOracle_ = permitOracle;
    }

    function setPoolSpecs (address base, address quote, uint24 poolIdx,
                           uint24 feeRate, uint8 protocolTake,
                           uint16 tickSize) internal {
        PoolSpecs.Pool storage pool = selectPool(base, quote, poolIdx);
        pool.feeRate_ = feeRate;
        pool.protocolTake_ = protocolTake;
        pool.tickSize_ = tickSize;
    }

    function setNewPoolLiq (uint128 liqAnte) internal {
        newPoolLiq_ = liqAnte;
    }

    function setPriceImprove (address token, uint128 unitTickCollateral,
                              uint16 awayTickTol) internal {
        improves_[token].unitCollateral_ = unitTickCollateral;
        improves_[token].awayTicks_ = awayTickTol;
    }

    function registerPool (address base, address quote, uint24 poolIdx) internal
        returns (PoolSpecs.PoolCursor memory, uint128 liqAnte) {
        PoolSpecs.Pool memory template = queryTemplate(base, quote, poolIdx);
        PoolSpecs.writePool(pools_, base, quote, poolIdx, template);
        return (queryPool(base, quote, poolIdx), newPoolLiq_);
    }

    function queryPriceImprove (PriceGrid.ImproveSettings memory dest,
                                Directives.PriceImproveReq memory req,
                                address base, address quote) view internal {
        if (req.isEnabled_) {
            address token = req.useBaseSide_ ? base : quote;
            dest.inBase_ = req.useBaseSide_;
            dest.unitCollateral_ = improves_[token].unitCollateral_;
            dest.awayTicks_ = improves_[token].awayTicks_;
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
        return pool.tickSize_ > 0;
    }

    function isPoolInit (PoolSpecs.PoolCursor memory pool)
        private pure returns (bool) {
        return pool.head_.tickSize_ > 0;
    }
}
