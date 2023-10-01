// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import '../libraries/Directives.sol';
import '../libraries/PoolSpecs.sol';
import '../libraries/PriceGrid.sol';
import '../interfaces/ICrocPermitOracle.sol';
import './StorageLayout.sol';

/* @title Pool registry mixin
 * @notice Provides a facility for registering and querying pool types on pairs and
 *         generalized pool templates for pools yet to be initialized. */
contract PoolRegistry is StorageLayout {
    using PoolSpecs for uint8;
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
        if (pool.oracle_ != address(0)) {
            uint16 discount =
                ICrocPermitOracle(pool.oracle_)
                .checkApprovedForCrocSwap(lockHolder_, msg.sender, base, quote,
                                          isBuy, inBaseQty, qty, pool.head_.feeRate_);
            applyDiscount(pool, discount);
        }
    }

    /* @notice Tests whether the given mint by the given user is authorized on this
     *         specific pool. If not, reverts the transaction. If pool is permissionless
     *         this function will just noop. */
    function verifyPermitMint (PoolSpecs.PoolCursor memory pool,
                               address base, address quote,
                               int24 bidTick, int24 askTick, uint128 liq) internal {
        if (pool.oracle_ != address(0)) {
            bool approved = ICrocPermitOracle(pool.oracle_)
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
        if (pool.oracle_ != address(0)) {
            bool approved = ICrocPermitOracle(pool.oracle_)
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
        if (pool.oracle_ != address(0)) {
            uint16 discount = ICrocPermitOracle(pool.oracle_)
                .checkApprovedForCrocPool(lockHolder_, msg.sender, base, quote, ambient,
                                          swap, concs, pool.head_.feeRate_);
            applyDiscount(pool, discount);
        }
    }

    function applyDiscount (PoolSpecs.PoolCursor memory pool, uint16 discount) private pure {
        // Convention from permit oracle return value. Uses 0 for non-approved (meaning we 
        // should rever), 1 for 0 discount, 2 for 0.0001% discount, and so on
        uint16 DISCOUNT_OFFSET = 1;
        require(discount > 0, "Z");
        pool.head_.feeRate_ -= (discount - DISCOUNT_OFFSET);
    }
    
    /* @notice Tests whether the given initialization by the given user is authorized on this
     *         specific pool. If not, reverts the transaction. If pool is permissionless
     *         this function will just noop. */
    function verifyPermitInit (PoolSpecs.PoolCursor memory pool,
                               address base, address quote, uint256 poolIdx) internal {
        if (pool.oracle_ != address(0)) {
            bool approved = ICrocPermitOracle(pool.oracle_).
                checkApprovedForCrocInit(lockHolder_, msg.sender, base, quote, poolIdx);
            require(approved, "Z");
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
     * @param tickSize The tick grid size for range orders in the pool. (Template can
     *                 also be disabled by setting this to zero.)
     * @param jitThresh The minimum time (in seconds) a concentrated LP position must 
     *                  rest before it can be burned.
     * @param knockout  The knockout liquidity bit flags for the pool. (See KnockoutLiq library)
     * @param oracleFlags The permissioned oracle flags for the pool. */
    function setPoolTemplate (uint256 poolIdx, uint16 feeRate, uint16 tickSize,
                              uint8 jitThresh, uint8 knockout, uint8 oracleFlags)
        internal {
        PoolSpecs.Pool storage templ = templates_[poolIdx];
        templ.schema_ = PoolSpecs.BASE_SCHEMA;
        templ.feeRate_ = feeRate;
        templ.tickSize_ = tickSize;
        templ.jitThresh_ = jitThresh;
        templ.knockoutBits_ = knockout;
        templ.oracleFlags_ = oracleFlags;

        // If template is set to use a permissioned oracle, validate that the oracle address is a
        // valid oracle contract
        address oracle = PoolSpecs.oracleForPool(poolIdx, oracleFlags);
        if (oracle != address(0)) {
            require(oracle.code.length > 0 && ICrocPermitOracle(oracle).acceptsPermitOracle(),
                "Oracle");    
        }
    }

    function disablePoolTemplate (uint256 poolIdx) internal {
        PoolSpecs.Pool storage templ = templates_[poolIdx];
        templ.schema_ = PoolSpecs.DISABLED_SCHEMA;
    }

    /* @notice Resets the parameters on a previously existing pool in a specific pair.
     *
     * @dev We do not allow the permitOracle to be changed after the pool has been 
     *      initialized. That would give the protocol authority too much power to 
     *      arbitrarily lock LPs out of their funds. 
     *
     * @param base The base-side token specification of the pair containing the pool.
     * @param quote The quote-side token specification of the pair containing the pool.
     * @param poolIdx The pool type index value. 
     * @param feeRate The pool's exchange fee as a percent of notional swapped. 
     *                Represented as a multiple of 0.0001%.
     * @param tickSize The tick grid size for range orders in the pool.
     * @param jitThresh The minimum time (in seconds) a concentrated LP position must 
     *                  rest before it can be burned.
     * @param knockoutBits The knockout liquiidity parameter bit flags for the pool. */
    function setPoolSpecs (address base, address quote, uint256 poolIdx,
                           uint16 feeRate, uint16 tickSize, uint8 jitThresh,
                           uint8 knockoutBits) internal {
        PoolSpecs.Pool storage pool = selectPool(base, quote, poolIdx);
        pool.feeRate_ = feeRate;
        pool.tickSize_ = tickSize;
        pool.jitThresh_ = jitThresh;
        pool.knockoutBits_ = knockoutBits;
    }

    // 10 million represents a sensible upper bound on initial pool, considering that the highest
    // price token per wei is USDC and similar 6-digit stablecoins. So 10 million in that context
    // represents about $10 worth of burned value. Considering that the initial liquidity commitment
    // should be economic de minims, because it's permenately locked, we wouldn't want to be much 
    // higher than this.
    uint128 constant MAX_INIT_POOL_LIQ = 10_000_000;

    /* @notice The creation of every new pool requires the pool initializer to 
     *         permanetely lock in a token amount of liquidity (possibly zero). This is
     *         set to be economically meaningless for normal cases but prevent the 
     *         creation of pools for tokens that don't exist or make it expensive to 
     *         create pools at extremely wrong prices. This function sets that liquidity
     *         ante value that determines how much liquidity must be locked at 
     *         initialization time. */
    function setNewPoolLiq (uint128 liqAnte) internal {
        require(liqAnte > 0 && liqAnte < MAX_INIT_POOL_LIQ, "Init liq");
        newPoolLiq_ = liqAnte;

    }

    function setProtocolTakeRate (uint8 takeRate) internal {
        require(takeRate <= MAX_TAKE_RATE, "TR");
        protocolTakeRate_ = takeRate;
    }

    function setRelayerTakeRate (uint8 takeRate) internal {
        require(takeRate <= MAX_TAKE_RATE, "TR");
        relayerTakeRate_ = takeRate;
    }

    function resyncProtocolTake (address base, address quote,
                                  uint256 poolIdx) internal {
        PoolSpecs.Pool storage pool = selectPool(base, quote, poolIdx);
        pool.protocolTake_ = protocolTakeRate_;
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
     *                template exists, this call will revert the transaction.)
     *
     * @return pool The pool specs associated with the newly created pool.
     * @return liqAnte The required amount of liquidity that the user must permanetely
     *                 lock to create the pool. (See setNewPoolLiq() above) */
    function registerPool (address base, address quote, uint256 poolIdx) internal
        returns (PoolSpecs.PoolCursor memory, uint128) {
        assertPoolFresh(base, quote, poolIdx);
        PoolSpecs.Pool memory template = queryTemplate(poolIdx);
        template.protocolTake_ = protocolTakeRate_;
        PoolSpecs.writePool(pools_, base, quote, poolIdx, template);
        return (queryPool(base, quote, poolIdx), newPoolLiq_);
    }

    /* @notice This returns the off-grid price improvement settings (if any) for the
     *         the side of the pair the user requests. (Or none, to save on gas,
     *         if the user doesn't explicitly request price improvement).
     *
     * @param req The user specificed price improvement request.
     * @param base The base-side token defining the pair.
     * @param quote The quote-side token defining the pair.
     * @return The price grid improvement thresholds (if any) for off-grid liquidity 
     *         positions. */
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
     * @param poolIdx The pool type index.
     * @return The current spec parameters for the pool. */
    function queryPool (address base, address quote, uint256 poolIdx)
        internal view returns (PoolSpecs.PoolCursor memory pool) {
        pool = PoolSpecs.queryPool(pools_, base, quote, poolIdx);
        require(isPoolInit(pool), "PI");
    }

    function assertPoolFresh (address base, address quote,
                              uint256 poolIdx) internal view {
        PoolSpecs.PoolCursor memory pool =
            PoolSpecs.queryPool(pools_, base, quote, poolIdx);
        require(!isPoolInit(pool), "PF");
    }

    /* @notice Checks if a given position is JIT eligible based on its mint timestamp.
     *         If not, the transaction will revert.
     * 
     * @dev Because JIT window is capped at 8-bit integers, we can avoid the SLOAD
     *      for all positions older than 2550 seconds, which are the vast majority.
     *
     * @param posTime The block time the position was created or had its liquidity 
     *                increased.
     * @param poolIdx The hash index of the AMM curve pool. */
    function assertJitSafe (uint32 posTime, bytes32 poolIdx) internal view {
        uint32 JIT_UNIT_SECONDS = 10;
        uint32 elapsedSecs = SafeCast.timeUint32() - posTime;
        uint32 elapsedUnits = elapsedSecs / JIT_UNIT_SECONDS;
        if (elapsedUnits <= type(uint8).max) {
            require(elapsedUnits >= pools_[poolIdx].jitThresh_, "J");
        }
    }

    /* @notice Looks up and returns a storage pointer associated with the pair and pool 
     *         type.
     *
     * @param base The base-side token defining the pair.
     * @param quote The quote-side token defining the pair.
     * @param poolIdx The pool type index.
     * @return Storage reference to the specs for the pool. */
    function selectPool (address base, address quote, uint256 poolIdx)
        private view returns (PoolSpecs.Pool storage pool) {
        pool = PoolSpecs.selectPool(pools_, base, quote, poolIdx);
        require(isPoolInit(pool), "PI");
    }

    /* @notice Looks up and returns the pool template associated with the pool type 
     *         index. If no template exists (or it was disabled after initialization)
     *         this call reverts the transaction. */
    function queryTemplate (uint256 poolIdx)
        private view returns (PoolSpecs.Pool memory template) {
        template = templates_[poolIdx];
        require(isPoolInit(template), "PT");
    }

    /* @notice Returns true if the pool spec object represents an initailized pool 
     *         that hasn't been disabled. */
    function isPoolInit (PoolSpecs.Pool memory pool)
        private pure returns (bool) {
        require(pool.schema_ <= PoolSpecs.BASE_SCHEMA, "IPS");
        return pool.schema_ == PoolSpecs.BASE_SCHEMA;
    }

    /* @notice Returns true if the pool cursor represents an initailized pool that
     *         hasn't been disabled. */
    function isPoolInit (PoolSpecs.PoolCursor memory pool)
        private pure returns (bool) {        
        require(pool.head_.schema_ <= PoolSpecs.BASE_SCHEMA, "IPS");
        return pool.head_.schema_ == PoolSpecs.BASE_SCHEMA;
    }
}
