// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;
import "../CrocSwapDex.sol";

/* @notice Stateless read only contract that provides functions for convienetly reading and
 *         parsing the internal state of a CrocSwapDex contract. 
 *
 * @dev Nothing in this contract can't be done by directly accessing readSlot() on the 
 *      CrocSwapDex contrct. However this provides a more convienent interface with ergonomic
 *      that parse the raw data. */
contract CrocQuery {
    using CurveMath for CurveMath.CurveState;
    using SafeCast for uint144;
    
    address immutable public dex_;

    /* @param dex The address of the CrocSwapDex contract. */    
    constructor (address dex) {
        require(dex != address(0) && CrocSwapDex(payable(dex)).acceptCrocDex(), "Invalid CrocSwapDex");
        dex_ = dex;
    }
    
    /* @notice Queries and returns the current state of a liquidity curve for a given pool.
     * 
     * @param base The base token address
     * @param quote The quote token address
     * @param poolIdx The pool index
     *
     * @return The CurveState struct of the underlying pool. */
    function queryCurve (address base, address quote, uint256 poolIdx)
        public view returns (CurveMath.CurveState memory curve) {
        bytes32 key = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.CURVE_MAP_SLOT));
        uint256 valOne = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));
        uint256 valTwo = CrocSwapDex(payable(dex_)).readSlot(uint256(slot)+1);
        
        curve.priceRoot_ = uint128((valOne << 128) >> 128);
        curve.ambientSeeds_ = uint128(valOne >> 128);
        curve.concLiq_ = uint128((valTwo << 128) >> 128);
        curve.seedDeflator_ = uint64((valTwo << 64) >> 192);
        curve.concGrowth_ = uint64(valTwo >> 192);
    }

    function queryPoolParams (address base, address quote, uint256 poolIdx)
        public view returns (PoolSpecs.Pool memory pool) {
        bytes32 key = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.POOL_PARAM_SLOT));
        uint256 valOne = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));

        pool.schema_ = uint8(valOne);
        pool.feeRate_ = uint16(valOne >> 8);
        pool.protocolTake_ = uint8(valOne >> 24);
        pool.tickSize_ = uint16(valOne >> 32);
        pool.jitThresh_ = uint8(valOne >> 48);
        pool.knockoutBits_ = uint8(valOne >> 56);
        pool.oracleFlags_ = uint8(valOne >> 64);
    }

    function queryPoolTemplate (uint256 poolIdx)
        public view returns (PoolSpecs.Pool memory pool) {
        bytes32 slot = keccak256(abi.encode(poolIdx, CrocSlots.POOL_TEMPL_SLOT));
        uint256 valOne = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));

        pool.schema_ = uint8(valOne);
        pool.feeRate_ = uint16(valOne >> 8);
        pool.protocolTake_ = uint8(valOne >> 24);
        pool.tickSize_ = uint16(valOne >> 32);
        pool.jitThresh_ = uint8(valOne >> 48);
        pool.knockoutBits_ = uint8(valOne >> 56);
        pool.oracleFlags_ = uint8(valOne >> 64);
    }

    /* @notice Queries and returns the 24-bit price tick for a given pool curve.
     * 
     * @param base The base token address of the pair
     * @param quote The quote token address of the pair
     * @param poolIdx The pool index
     *
     * @return The 24-bit price for the pool's curve's price */
    function queryCurveTick (address base, address quote, uint256 poolIdx) 
        public view returns (int24) {
        bytes32 key = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.CURVE_MAP_SLOT));
        uint256 valOne = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));
        
        uint128 curvePrice = uint128((valOne << 128) >> 128);
        return TickMath.getTickAtSqrtRatio(curvePrice);
    }

    /* @notice Queries and returns the total liquidity currently active on the pool's curve
     * 
     * @param base The base token address
     * @param quote The quote token address
     * @param poolIdx The pool index
     *
     * @return The total sqrt(X*Y) liquidity currently active in the pool */
    function queryLiquidity (address base, address quote, uint256 poolIdx)
        public view returns (uint128) {        
        return queryCurve(base, quote, poolIdx).activeLiquidity();
    }

    /* @notice Queries and returns the current price of the pool's curve
     * 
     * @param base The base token address
     * @param quote The quote token address
     * @param poolIdx The pool index
     *
     * @return Q64.64 square root price of the pool */
    function queryPrice (address base, address quote, uint256 poolIdx)
        public view returns (uint128) {
        return queryCurve(base, quote, poolIdx).priceRoot_;
    }

    /* @notice Queries and returns the surplus collateral of a specific token held by
     *         a specific address.
     *
     * @param owner The address of the owner of the surplus collateral
     * @param token The address of the token balance being queried.
     *
     * @return The total amount of surplus collateral held by this owner in this token.
     *         0 if none. */
    function querySurplus (address owner, address token)
        public view returns (uint128 surplus) {
        bytes32 key = keccak256(abi.encode(owner, token));
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.BAL_MAP_SLOT));
        uint256 val = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));
        surplus = uint128((val << 128) >> 128);
    }

    /* @notice Queries and returns the surplus collateral of a virtual token
     *
     * @param owner The address of the owner of the surplus collateral
     * @param tracker The address of the virtual token tracker
     * @param salt The virtual token salt for the query
     *
     * @return The total amount of surplus collateral held by this owner in this token.
     *         0 if none. */
    function queryVirtual (address owner, address tracker, uint256 salt)
        public view returns (uint128 surplus) {
        address token = PoolSpecs.virtualizeAddress(tracker, salt);
        surplus = querySurplus(owner, token);
    }

    /* @notice Queries and returns the current protocol fees accumulated for a given token. */
    function queryProtocolAccum (address token) public view returns (uint128) {
        bytes32 key = bytes32(uint256(uint160(token)));
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.FEE_MAP_SLOT));
        uint256 val = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));
        return uint128(val);
    }

    /* @notice Queries and returns the state of a given concentrated liquidity tick level
     *         for a liquidity curve.
     *
     * @param base The base token address of the pair
     * @param quote The quote token address of the pair
     * @param poolIdx The index of the pool type
     * @param tick The 24-bit price tick location of the level.
     *
     * @return bidLots The amount of concentrated liquidity that becomes active if the pool
     *                 price falls below the level tick (and vice versa). Represented in units
     *                 of 1024 lots of sqrt(X*Y) liquidity.
     * @return bidLots The amount of concentrated liquidity that becomes active if the pool
     *                 price rises below the level (and vice versa). Represented in units
     *                 of 1024 lots of sqrt(X*Y) liquidity.
     * @return odometer The currnet fee odomter snapshotted at the current tick boundary. */
    function queryLevel (address base, address quote, uint256 poolIdx, int24 tick)
        public view returns (uint96 bidLots, uint96 askLots, uint64 odometer) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 key = keccak256(abi.encodePacked(poolHash, tick));
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.LVL_MAP_SLOT));
        uint256 val = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));

        odometer = uint64(val >> 192);
        askLots = uint96((val << 64) >> 160);
        bidLots = uint96((val << 160) >> 160);
    }

    /* @notice Queries and returns the state of the aggregated knockout liquidity at the tick
     *         location in a given pool's curve.
     *
     * @param base The base token address of the pair
     * @param quote The quote token address of the pair
     * @param poolIdx The index of the pool type
     * @param isBid If true, represents liquidity pivot that gets knocked out when the curve
     *              price falls below the tick. And vice versa, if false.
     * @param tick The 24-bit price tick location of the level.
     *
     * @return lots The amount of aggregated liquidity active at the pivot. In units of 1024
     *              lots of sqrt(X*Y) liquidity.
     * @return pivot The block time that the pivot was first created. Equivalent to the block
     *               time of the first position to be minted at the pivot.
     * @return range The total with, in ticks, of the range liquidity in the knockout pivot. */
    function queryKnockoutPivot (address base, address quote, uint256 poolIdx,
                                 bool isBid, int24 tick)
        public view returns (uint96 lots, uint32 pivot, uint16 range) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 key = KnockoutLiq.encodePivotKey(poolHash, isBid, tick);
        bytes32 slot = keccak256(abi.encodePacked(key, CrocSlots.KO_PIVOT_SLOT));
        uint256 val = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));

        lots = uint96((val << 160) >> 160);
        pivot = uint32((val << 128) >> 224);
        range = uint16(val >> 128);
    }

    /* @notice Queries and returns the latest posted Merkle root for the sequence of knockout
     *         events at a given tick pivot in a given pool
     *
     * @param base The base token address of the pair
     * @param quote The quote token address of the pair
     * @param poolIdx The index of the pool type
     * @param isBid If true, represents liquidity pivot that gets knocked out when the curve
     *              price falls below the tick. And vice versa, if false.
     * @param tick The 24-bit price tick location of the level.
     *
     * @return root The random Merkle root of the last knockout pivot. Any claimed knockout
     *              position for previously knocked out positions at this tick location must
     *              post a Merkle proof that resolves to this root.
     * @return pivot The block time of the last pivot to be knocked out at this tick location.
     * @return fee The accumulated range order fee at the knockout time (in units of ambient 
     *             liquidity seeds per unit of concentrated liqudidity) */
    function queryKnockoutMerkle (address base, address quote, uint256 poolIdx,
                                  bool isBid, int24 tick)
        public view returns (uint160 root, uint32 pivot, uint64 fee) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 key = KnockoutLiq.encodePivotKey(poolHash, isBid, tick);
        bytes32 slot = keccak256(abi.encodePacked(key, CrocSlots.KO_MERKLE_SLOT));
        uint256 val = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));

        root = uint160((val << 96) >> 96);
        pivot = uint32((val << 64) >> 224);
        fee = uint64(val >> 192);
    }

    /* @notice Queries and returns the state of a single knockout liquidity position.
     *
     * @param base The base token address of the pair
     * @param quote The quote token address of the pair
     * @param poolIdx The index of the pool type
     * @param pivot The time associated with the pivot the position was created on
     * @param isBid If true, represents liquidity pivot that gets knocked out when the curve
     *              price falls below the tick. And vice versa, if false.
     * @param lowerTick The 24-bit price tick the lower end of the liquidity range
     * @param upperTick The 24-bit price tick the lower end of the liquidity range
     *
     * @return lots The total amount of liquidity in the position, in units of 1024 lots of
     *              sqrt(X*Y) liquidity
     * @return mileage The in-range curve fee mileage assigned to the liquidity. Used to
     *                 calculate accumulated rewards based on the curve.
     * @return timestamp The block time that the liquidity is stamped with from latest mint */
    function queryKnockoutPos (address owner, address base, address quote,
                               uint256 poolIdx, uint32 pivot, bool isBid,
                               int24 lowerTick, int24 upperTick) public view
        returns (uint96 lots, uint64 mileage, uint32 timestamp) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        KnockoutLiq.KnockoutPosLoc memory loc;
        loc.isBid_ = isBid;
        loc.lowerTick_ = lowerTick;
        loc.upperTick_ = upperTick;

        return queryKnockoutPos(loc, poolHash, owner, pivot);
    }

    /* @notice Queries and returns the state of a single knockout liquidity position.
     *
     * @param loc The location of the knockout liquidity position on the curve
     * @param poolHash The unique hash associated with the pool
     * @param owner The address that owns the liquidity position
     * @param pivot The time associated with the pivot the position was created on
     *
     * @return lots The total amount of liquidity in the position, in units of 1024 lots of
     *              sqrt(X*Y) liquidity
     * @return mileage The in-range curve fee mileage assigned to the liquidity. Used to
     *                 calculate accumulated rewards based on the curve.
     * @return timestamp The block time that the liquidity is stamped with from latest mint */
    function queryKnockoutPos (KnockoutLiq.KnockoutPosLoc memory loc,
                               bytes32 poolHash, address owner, uint32 pivot)
        private view returns (uint96 lots, uint64 mileage, uint32 timestamp) {
        bytes32 key = KnockoutLiq.encodePosKey(loc, poolHash, owner, pivot);
        bytes32 slot = keccak256(abi.encodePacked(key, CrocSlots.KO_POS_SLOT));
        uint256 val = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));

        lots = uint96((val << 160) >> 160);
        mileage = uint64((val << 96) >> 224);
        timestamp = uint32(val >> 224);
    }

    /* @notice Queries and returns the state of a single range order liquidity position.
     *
     * @param owner The address that owns the liquidity position
     * @param base The base token address of the pair
     * @param quote The quote token address of the pair
     * @param poolIdx The index of the pool type
     * @param lowerTick The 24-bit price tick the lower end of the liquidity range
     * @param upperTick The 24-bit price tick the lower end of the liquidity range
     *
     * @return liq The total amount of liquidity in the position in units of sqrt(X*Y) liquidity
     * @return fee The in-range curve fee mileage assigned to the liquidity. Used to
     *             calculate accumulated rewards based on the curve.
     * @return timestamp The block time that the liquidity is stamped with from latest mint
     * @return atomic If true indicates that the liquidity position is atomic and user cannot
     *                mint additional liquidity at this position unless original liquidity is
     *                fully burned. */
    function queryRangePosition (address owner, address base, address quote,
                                 uint256 poolIdx, int24 lowerTick, int24 upperTick)
        public view returns (uint128 liq, uint64 fee,
                             uint32 timestamp, bool atomic) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 posKey = keccak256(abi.encodePacked(owner, poolHash, lowerTick, upperTick));
        bytes32 slot = keccak256(abi.encodePacked(posKey, CrocSlots.POS_MAP_SLOT_72));
        uint256 val = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));

        liq = uint128((val << 128) >> 128);
        fee = uint64((val >> 128) << (128 + 64) >> (128 + 64));
        timestamp = uint32((val >> (128 + 64)) << (128 + 64 + 32) >> (128 + 64 + 32));
        atomic = bool((val >> (128 + 64 + 32)) > 0);
    }

    /* @notice Queries and returns the state of a single ambient order liquidity position.
     *
     * @param owner The address that owns the liquidity position
     * @param base The base token address of the pair
     * @param quote The quote token address of the pair
     * @param poolIdx The index of the pool type
     *
     * @return seeds The total amount of ambient liquidity seeds in the position in units
     *               of rewards deflated sqrt(X*Y) liquidity
     * @return timestamp The block time that the liquidity is stamped with from latest mint */
    function queryAmbientPosition (address owner, address base, address quote,
                                   uint256 poolIdx)
        public view returns (uint128 seeds, uint32 timestamp) {
        bytes32 poolHash = PoolSpecs.encodeKey(base, quote, poolIdx);
        bytes32 posKey = keccak256(abi.encodePacked(owner, poolHash));
        bytes32 slot = keccak256(abi.encodePacked(posKey, CrocSlots.AMB_MAP_SLOT));
        uint256 val = CrocSwapDex(payable(dex_)).readSlot(uint256(slot));

        seeds = uint128((val << 128) >> 128);
        timestamp = uint32((val >> (128)) << (128 + 32) >> (128 + 32));
    }    

    /* @notice Queries and returns the total ambient liquidity rewards accumulated by a
     *         given active range liquidity position
     *
     * @param owner The address that owns the liquidity position
     * @param base The base token address of the pair
     * @param quote The quote token address of the pair
     * @param poolIdx The index of the pool type
     * @param lowerTick The 24-bit price tick the lower end of the liquidity range
     * @param upperTick The 24-bit price tick the lower end of the liquidity range
     *
     * @return The total accumulated rewards in the form of ambient sqrt(X*Y) liquidity */
    function queryConcRewards (address owner, address base, address quote, uint256 poolIdx,
                               int24 lowerTick, int24 upperTick) 
                               public view returns (uint128 liqRewards, 
                                                    uint128 baseRewards, uint128 quoteRewards) {
        (uint128 liq, uint64 feeStart, ,) = queryRangePosition(owner, base, quote, poolIdx,
                                                               lowerTick, upperTick);
        (, , uint64 bidFee) = queryLevel(base, quote, poolIdx, lowerTick);
        (, , uint64 askFee) = queryLevel(base, quote, poolIdx, upperTick);
        CurveMath.CurveState memory curve = queryCurve(base, quote, poolIdx);
        uint64 curveFee = queryCurve(base, quote, poolIdx).concGrowth_;

        int24 curveTick = TickMath.getTickAtSqrtRatio(curve.priceRoot_);
        uint64 feeLower = lowerTick <= curveTick ? bidFee : curveFee - bidFee;
        uint64 feeUpper = upperTick <= curveTick ? askFee : curveFee - askFee;
            
        unchecked {
            uint72 odometer = uint72(type(uint64).max) + uint72(feeUpper) - uint72(feeLower);

            if (odometer < feeStart) {
                return (0, 0, 0);
            }

            uint64 accumFees = uint64(odometer - feeStart);
            uint128 seeds = FixedPoint.mulQ48(liq, accumFees).toUint128By144();
            return convertSeedsToLiq(curve, seeds);
        }
    }

    /* @notice Queries and returns the liquidity and tokens held by a single ambient
     *         liquidity position
     *
     * @param owner The address that owns the liquidity position
     * @param base The base token address of the pair
     * @param quote The quote token address of the pair
     * @param poolIdx The index of the pool type
     *
     * @return liq The total amount of ambient sqrt(X*Y) liquidity 
     * @return baseQty The base-side tokens held by the current position at current 
     *                 curve price.
     * @return quoteQty The quote-side tokens held by the current position at current 
     *                  curve price. */
    function queryAmbientTokens (address owner, address base, address quote,
                                 uint256 poolIdx)
        public view returns (uint128 liq, uint128 baseQty, uint128 quoteQty) {
        (uint128 seeds, ) = queryAmbientPosition(owner, base, quote, poolIdx);
        CurveMath.CurveState memory curve = queryCurve(base, quote, poolIdx);
        return convertSeedsToLiq(curve, seeds);
    }

    /* @notice Queries and returns the liquidity and tokens held by a single range
     *         position. Note that the returned quantities do *not* include accumulated
     *         rewards.
     *
     * @param owner The address that owns the liquidity position
     * @param base The base token address of the pair
     * @param quote The quote token address of the pair
     * @param poolIdx The index of the pool type
     * @param lowerTick The 24-bit price tick the lower end of the liquidity range
     * @param upperTick The 24-bit price tick the lower end of the liquidity range
     *
     * @return liq The total amount of ambient sqrt(X*Y) liquidity 
     * @return baseQty The base-side tokens held by the current position at current 
     *                 curve price.
     * @return quoteQty The quote-side tokens held by the current position at current 
     *                  curve price. */
    function queryRangeTokens (address owner, address base, address quote,
                               uint256 poolIdx, int24 lowerTick, int24 upperTick)
        public view returns (uint128 liq, uint128 baseQty, uint128 quoteQty) {
        (liq, , ,) = queryRangePosition(owner, base, quote, poolIdx, lowerTick, upperTick);
        CurveMath.CurveState memory curve = queryCurve(base, quote, poolIdx);
        (baseQty, quoteQty) = concLiqToTokens(curve, lowerTick, upperTick, liq);
    }

    /* @notice Queries and returns the liquidity and tokens held by a single knockout
     *         position. Note that the returned quantities do *not* include accumulated
     *         rewards.
     *
     * @param owner The address that owns the liquidity position
     * @param base The base token address of the pair
     * @param quote The quote token address of the pair
     * @param poolIdx The index of the pool type
     * @param pivot The time associated with the pivot the position was created on
     * @param isBid If true, represents liquidity pivot that gets knocked out when the curve
     *              price falls below the tick. And vice versa, if false.
     * @param lowerTick The 24-bit price tick the lower end of the liquidity range
     * @param upperTick The 24-bit price tick the lower end of the liquidity range
     *
     * @return liq The total amount of ambient sqrt(X*Y) liquidity 
     * @return baseQty The base-side tokens held by the current position at current 
     *                 curve price.
     * @return quoteQty The quote-side tokens held by the current position at current 
     *                  curve price.
     * @return knockedOut Returns true if the position has been knocked out of the curve.
     *                    In which case the values represent the tokens claimable. False,
     *                    if the liquidity is still active in the curve. */
    function queryKnockoutTokens (address owner, address base, address quote,
                                  uint256 poolIdx, uint32 pivot, bool isBid,
                                  int24 lowerTick, int24 upperTick)
        public view returns (uint128 liq, uint128 baseQty, uint128 quoteQty, bool knockedOut) {

        int24 knockoutTick = isBid ? lowerTick : upperTick;
        (uint96 lots, , ) = queryKnockoutPos(owner, base, quote, poolIdx, pivot, isBid, lowerTick, upperTick);
        (, uint32 pivotActive, ) = queryKnockoutPivot(base, quote, poolIdx, isBid, knockoutTick);

        liq = LiquidityMath.lotsToLiquidity(lots);
        knockedOut = pivotActive != pivot;

        if (knockedOut) {
            uint128 knockoutPrice = TickMath.getSqrtRatioAtTick(knockoutTick);
            (baseQty, quoteQty) = concLiqToTokens(knockoutPrice, lowerTick, upperTick, liq);

        } else {
            CurveMath.CurveState memory curve = queryCurve(base, quote, poolIdx);
            (baseQty, quoteQty) = concLiqToTokens(curve, lowerTick, upperTick, liq);
        }
    }

    /* @notice Connverts an arbitrary liquidity seeds value to XYK liquidity and equivalent
     *         full-range tokens for that liquidity. */ 
    function convertSeedsToLiq (CurveMath.CurveState memory curve, uint128 seeds) 
                                internal pure returns (uint128 liq, uint128 baseQty, uint128 quoteQty) {
        liq = CompoundMath.inflateLiqSeed(seeds, curve.seedDeflator_);
        (baseQty, quoteQty) = liquidityToTokens(curve, liq);
    }

    /* @notice Converts an arbitrary concentrated liquidity quantity in a given range to 
     *         the quantity of tokens in the position, given the current price. */
    function concLiqToTokens (CurveMath.CurveState memory curve, 
                              int24 lowerTick, int24 upperTick, uint128 liq) 
        internal pure returns (uint128 baseQty, uint128 quoteQty) {
        return concLiqToTokens(curve.priceRoot_, lowerTick, upperTick, liq);
    }

    /* @notice Converts an arbitrary concentrated liquidity quantity in a given range to 
     *         the quantity of tokens in the position, given the current price. */
    function concLiqToTokens (uint128 curvePrice, 
                              int24 lowerTick, int24 upperTick, uint128 liq) 
        internal pure returns (uint128 baseQty, uint128 quoteQty) {
        uint128 lowerPrice = TickMath.getSqrtRatioAtTick(lowerTick);
        uint128 upperPrice = TickMath.getSqrtRatioAtTick(upperTick);

        (uint128 lowerBase, uint128 lowerQuote) = liquidityToTokens(lowerPrice, liq);
        (uint128 upperBase, uint128 upperQuote) = liquidityToTokens(upperPrice, liq);
        (uint128 ambBase, uint128 ambQuote) = liquidityToTokens(curvePrice, liq);

        if (curvePrice < lowerPrice) {
            return (0, lowerQuote - upperQuote);
        } else if (curvePrice >= upperPrice) {
            return (upperBase - lowerBase, 0);
        } else {
            return (ambBase - lowerBase, ambQuote - upperQuote);
        }
    }

    /* @notice Converts a liquidity value to the equivalent amount of full-range virtual tokens. */
    function liquidityToTokens (CurveMath.CurveState memory curve, uint128 liq) 
                                internal pure returns (uint128 baseQty, uint128 quoteQty) {
        return liquidityToTokens(curve.priceRoot_, liq);
    }

    /* @notice Converts a liquidity value to the equivalent amount of full-range virtual tokens. */
    function liquidityToTokens (uint128 curvePrice, uint128 liq)
                                internal pure returns (uint128 baseQty, uint128 quoteQty) {
        baseQty = uint128(FixedPoint.mulQ64(liq, curvePrice));
        quoteQty = uint128(FixedPoint.divQ64(liq, curvePrice));        
    }
}
