// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';
import '../libraries/PoolSpecs.sol';
import '../libraries/PriceGrid.sol';
import '../interfaces/ICrocSwapPermitOracle.sol';
import './StorageLayout.sol';

import "hardhat/console.sol";

/* @title Pool registry mixin
 * @notice Provides a facility for registering and querying pool types on pairs and
 *         generalized pool templates for pools yet to be initialized. */
contract PoolRegistry is StorageLayout {

    using PoolSpecs for PoolSpecs.Pool;

    uint8 constant SWAP_ACT_CODE = 1;
    uint8 constant MINT_ACT_CODE = 2;
    uint8 constant BURN_ACT_CODE = 3;
    uint8 constant COMP_ACT_CODE = 4;

    /* @notice Tests whether the given swap by the given user is authorized on this
     *         specific pool. If not, reverts the transaction. If pool is permissionless
     *         this function will just noop. */
    function verifyPermitSwap (PoolSpecs.PoolCursor memory pool,
                               address base, address quote,
                               bool isBuy, bool inBaseQty, uint128 qty) internal {
        if (pool.head_.permitOracle_ != address(0)) {
            uint24 discount =
                ICrocSwapPermitOracle(pool.head_.permitOracle_)
                .checkApprovedForCrocSwap(lockHolder_, msg.sender, base, quote,
                                          isBuy, inBaseQty, qty, pool.head_.feeRate_);
            require(discount > 0, "Z");
            pool.head_.feeRate_ -= discount;
        }
    }

    /* @notice Tests whether the given mint by the given user is authorized on this
     *         specific pool. If not, reverts the transaction. If pool is permissionless
     *         this function will just noop. */
    function verifyPermitMint (PoolSpecs.PoolCursor memory pool,
                               address base, address quote,
                               int24 bidTick, int24 askTick, uint128 liq) internal {
        if (pool.head_.permitOracle_ != address(0)) {
            bool approved = ICrocSwapPermitOracle(pool.head_.permitOracle_)
                .checkApprovedForCrocMint(lockHolder_, msg.sender, base, quote,
                                          bidTick, askTick, liq);
            require(approved, "Z");
        }
    }

    /* @notice Tests whether the given burn by the given user is authorized on this
     *         specific pool. If not, reverts the transaction. If pool is permissionless
     *         this function will just noop. */
    function verifyPermitBurn (PoolSpecs.PoolCursor memory pool,
                               address base, address quote,
                               int24 bidTick, int24 askTick, uint128 liq) internal {
        if (pool.head_.permitOracle_ != address(0)) {
            bool approved = ICrocSwapPermitOracle(pool.head_.permitOracle_)
                .checkApprovedForCrocBurn(lockHolder_, msg.sender, base, quote,
                                          bidTick, askTick, liq);
            require(approved, "Z");
        }
    }

    /* @notice Tests whether the given pool directive by the given user is authorized on 
     *         this specific pool. If not, reverts the transaction. If pool is 
     *         permissionless this function will just noop. */
    function verifyPermit (PoolSpecs.PoolCursor memory pool,
                           address base, address quote,
                           Directives.AmbientDirective memory ambient,
                           Directives.SwapDirective memory swap,
                           Directives.ConcentratedDirective[] memory concs) internal {
        if (pool.head_.permitOracle_ != address(0)) {
            uint24 discount =
                ICrocSwapPermitOracle(pool.head_.permitOracle_)
                .checkApprovedForCrocPool(lockHolder_, msg.sender, base, quote, ambient,
                                          swap, concs, pool.head_.feeRate_);
            require(discount > 0, "Z");
            pool.head_.feeRate_ -= discount;
        }
    }

    /* @notice Creates (or resets if previously existed) a new pool template associated
     *         with an arbitrary pool index. After calling, any pair's pool initialized
     *         at this index will be created using this template.
     *
     * @dev    Previously existing pools at this index will *not* be updated by this 
     *         call, and must be individually reset. This is only a consideration if the
     *         template is being reset, as a pool can't be created at an index beore a
     *         template exists.
     *
     * @param poolIdx The arbitrary index for which this template will be created. After
     *                calling, any user will be able to initialize a pool with this 
     *                template in any pair by using this pool index.
     * @param feeRate The pool's exchange fee as a percent of notional swapped. 
     *                Represented as a multiple of 0.0001%.
     * @param protocolTake The protocol's take rate on the pool's fees. (The rest goes to
     *                liquidity rewards.) Specified as a fraction 1/n. Zero is a special
     *                case that indicates the protocol fee is turned off.
     * @param tickSize The tick grid size for range orders in the pool. (Template can
     *                 also be disabled by setting this to zero.)
     * @param permitOracle The address of the external permission oracle contract that
     *                governs who and how can use the pool. If zero, the pool is 
     *                permissionless.
     * @param jitThresh The minimum time (in seconds) a concentrated LP position must 
     *                  rest before it can be burned. */
    function setPoolTemplate (uint24 poolIdx, uint24 feeRate,
                              uint8 protocolTake, uint16 tickSize,
                              address permitOracle, uint8 jitThresh) internal {
        PoolSpecs.Pool storage templ = templates_[poolIdx];
        templ.feeRate_ = feeRate;
        templ.protocolTake_ = protocolTake;
        templ.tickSize_ = tickSize;
        templ.jitThresh_ = jitThresh;
        templ.permitOracle_ = permitOracle;
    }

    /* @notice Resets the parameters on a previously existing pool in a specific pair.
     *
     * @dev We do not allow the permitOracle to be changed after the pool has been 
     *      initialized. That would give the protocol authority to much power to 
     *      arbitrarily lock LPs out of their funds. 
     *
     * @param base The base-side token specification of the pair containing the pool.
     * @param quote The quote-side token specification of the pair containing the pool.
     * @param feeRate The pool's exchange fee as a percent of notional swapped. 
     *                Represented as a multiple of 0.0001%.
     * @param protocolTake The protocol's take rate on the pool's fees. (The rest goes to
     *                liquidity rewards.) Specified as a fraction 1/n. Zero is a special
     *                case that indicates the protocol fee is turned off.
     * @param tickSize The tick grid size for range orders in the pool.
     * @param jitThresh The minimum time (in seconds) a concentrated LP position must 
     *                  rest before it can be burned. */
    function setPoolSpecs (address base, address quote, uint24 poolIdx,
                           uint24 feeRate, uint8 protocolTake,
                           uint16 tickSize, uint8 jitThresh) internal {
        PoolSpecs.Pool storage pool = selectPool(base, quote, poolIdx);
        pool.feeRate_ = feeRate;
        pool.protocolTake_ = protocolTake;
        pool.tickSize_ = tickSize;
        pool.jitThresh_ = jitThresh;
        
        // Even the protocol authority should not be able to lock up an initialized pool,
        // otherwise LPs could find themselves locked out of their funds. 
        require(tickSize > 0);
    }

    /* @notice The creation of every new pool requires the pool initializer to 
     *         permanetely lock in a token amount of liquidity (possibly zero). This is
     *         set to be economically meaningless for normal cases but prevent the 
     *         creation of pools for tokens that don't exist or make it expensive to 
     *         create pools at extremely wrong prices. This function sets that liquidity
     *         ante value that determines how much liquidity must be locked at 
     *         initialization time. */
    function setNewPoolLiq (uint128 liqAnte) internal {
        newPoolLiq_ = liqAnte;
    }

    /* @notice Sets the off-grid price improvement thresholds for a specific token. Once
     *         set this will apply to every pool in every pair over this token. The 
     *         stored settings for a token can be initialized, then later reset 
     *         arbitararily.
     *
     * @param token The token these settings apply to (if 0x0, they apply to native 
     *              Eth pairs)
     * @param unitTickCollateral The collateral threshold per off-grid tick.
     * @param awayTickTol The maximum ticks away from the current price that an off-grid
     *                    range order can apply. */
    function setPriceImprove (address token, uint128 unitTickCollateral,
                              uint16 awayTickTol) internal {
        improves_[token].unitCollateral_ = unitTickCollateral;
        improves_[token].awayTicks_ = awayTickTol;
    }

    /* @notice This is called during the initialization of a new pool. It registers the
     *         pool for this pair and type in storage for later access. Note that the
     *         caller still needs to actually construct the curve, collect the required
     *         collateral, etc. All this does is storage the pool specs.
     * 
     * @param base The base-side token (or 0x0 for native Eth) defining the pair.
     * @param quote The quote-side token defining the pair.
     * @param poolIdx The pool type index for the newly created pool. The pool specs will
     *                be created from the current template for this index. (If no 
     *                template exists, this call will rever the transaction.)
     *
     * @return pool The pool specs associated with the newly created pool.
     * @return liqAnte The required amount of liquidity that the user must permanetely
     *                 lock to create the pool. (See setNewPoolLiq() above) */
    function registerPool (address base, address quote, uint24 poolIdx) internal
        returns (PoolSpecs.PoolCursor memory, uint128) {
        PoolSpecs.Pool memory template = queryTemplate(poolIdx);
        PoolSpecs.writePool(pools_, base, quote, poolIdx, template);
        return (queryPool(base, quote, poolIdx), newPoolLiq_);
    }

    /* @notice This returns the off-grid price improvement settings (if any) for the
     *         the side of the pair the user requests. (Or none, to save on gas,
     *         if the user doesn't explicitly request price improvement).
     *
     * @param req The user specificed price improvement request.
     * @param base The base-side token defining the pair.
     * @param quote The quote-side token defining the pair. */
    function queryPriceImprove (Directives.PriceImproveReq memory req,
                                address base, address quote)
        view internal returns (PriceGrid.ImproveSettings memory dest) {
        if (req.isEnabled_) {
            address token = req.useBaseSide_ ? base : quote;
            dest.inBase_ = req.useBaseSide_;
            dest.unitCollateral_ = improves_[token].unitCollateral_;
            dest.awayTicks_ = improves_[token].awayTicks_;
        }
    }

    /* @notice Looks up and returns the pool specs associated with the pair and pool type
     *
     * @dev If no pool exists, this call reverts the transaction.
     *
     * @param base The base-side token defining the pair.
     * @param quote The quote-side token defining the pair.
     * @param poolIdx The pool type index. */
    function queryPool (address base, address quote, uint24 poolIdx)
        internal view returns (PoolSpecs.PoolCursor memory pool) {
        pool = PoolSpecs.queryPool(pools_, base, quote, poolIdx);
        require(isPoolInit(pool), "PI");
    }

    function assertPoolFresh (address base, address quote, uint24 poolIdx) internal view {
        PoolSpecs.PoolCursor memory pool =
            PoolSpecs.queryPool(pools_, base, quote, poolIdx);
        require(!isPoolInit(pool), "PF");
    }

    /* @notice Looks up and returns a storage pointer associated with the pair and pool 
     *         type.
     *
     * @param base The base-side token defining the pair.
     * @param quote The quote-side token defining the pair.
     * @param poolIdx The pool type index. */
    function selectPool (address base, address quote, uint24 poolIdx)
        private view returns (PoolSpecs.Pool storage pool) {
        pool = PoolSpecs.selectPool(pools_, base, quote, poolIdx);
        require(isPoolInit(pool), "PI");
    }

    /* @notice Looks up and returns the pool template associated with the pool type 
     *         index. If no template exists (or it was disabled after initialization)
     *         this call reverts the transaction. */
    function queryTemplate (uint24 poolIdx)
        private view returns (PoolSpecs.Pool memory template) {
        template = templates_[poolIdx];
        require(isPoolInit(template), "PT");
    }

    /* @notice Returns true if the pool spec object represents an initailized pool 
     *         that hasn't been disabled. */
    function isPoolInit (PoolSpecs.Pool memory pool)
        private pure returns (bool) {
        return pool.tickSize_ > 0;
    }

    /* @notice Returns true if the pool cursor represents an initailized pool that
     *         hasn't been disabled. */
    function isPoolInit (PoolSpecs.PoolCursor memory pool)
        private pure returns (bool) {
        return pool.head_.tickSize_ > 0;
    }
}
