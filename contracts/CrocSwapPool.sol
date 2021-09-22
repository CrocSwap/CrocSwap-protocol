// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './interfaces/ICrocSwapPool.sol';

import './libraries/LowGasSafeMath.sol';
import './libraries/SafeCast.sol';

import './libraries/TransferHelper.sol';
import './libraries/TickMath.sol';
import './libraries/LiquidityMath.sol';
import './libraries/CurveMath.sol';
import './libraries/SwapCurve.sol';
import './libraries/TickCensus.sol';

import './interfaces/ICrocSwapFactory.sol';
import './interfaces/IERC20Minimal.sol';
import './interfaces/callback/IUniswapV3MintCallback.sol';
import './interfaces/callback/IUniswapV3SwapCallback.sol';

import './mixins/PositionRegistrar.sol';
import './mixins/LiquidityCurve.sol';
import './mixins/LevelBook.sol';
import './mixins/ProtocolAccount.sol';

import "hardhat/console.sol";

/* @title CrocSwap Pool
 * @notice The top level object represenitng a liquidity pool. A unique pool can exist
 *         for each possible combination of token pairs and fee tiers. The pool is 
 *         responsible for supporting individually staked concentrated and ambient 
 *         liquidity postions, aggregating those positions into a curve that behaves
 *         locally like a constant product AMM, bumping liquidity as concentrated 
 *         positions move in and out of range, and paying everyone's pro-rata shares
 *         of the mined liquidity rewards. */
contract CrocSwapPool is ICrocSwapPool,
    PositionRegistrar, LiquidityCurve, LevelBook, ProtocolAccount {
    
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;
    using SwapCurve for CurveMath.CurveState;
    using SwapCurve for CurveMath.SwapAccum;
    using CurveRoll for CurveMath.CurveState;
    using CurveMath for CurveMath.CurveState;

    /* @param factoryRef The address of the CrocSwap factory object, which is owned
     *                   by the protocol and used to set protocol wide configurations. 
     *                   The factory controls the owner of the pool.
     * @param tokenQuote The address of the token on the quote side of the pair. Prices
     *                   are quoted with the value of the quote token in the numerator.
     *                   E.g. we say that ETH/USDT is 3300. The side of the quote token
     *                   is determined mechanically and arbitrarily. Front-ends can and
     *                   should represnet their own quotes based on the logical pair.
     * @param tokenBase  The address of the token on the base side of the pair.
     * @param feeRate    The fee tier of the pool. Represented as in integer in terms
     *                   of hundreths of a basis point (i.e. 0.0001%). This is the total
     *                   fee rate paid by swappers, and is divided between liquidity 
     *                   miners and the CrocSwap protocol.
     * @param tickUnits  The minimum granularity of valid tick spacings in terms of basis
     *                   points (0.01%). Unlike the other params, this value can be 
     *                   changed by the pool owner after the pool is created. */
    constructor (address factoryRef, address tokenQuote, address tokenBase,
                 uint24 feeRate, uint16 tickUnits) {
        (factory_, tokenBase_, tokenQuote_, feeRate_) =
            (factoryRef, tokenBase, tokenQuote, feeRate);
        setTickSize(DFLT_POOL_IDX, tickUnits);
    }

    function factory() external view override returns (address) {
        return factory_;
    }
    function token0() external view override returns (address) {
        return tokenQuote_;
    }
    function token1() external view override returns (address) {
        return tokenBase_;
    }
    function fee() external view override returns (uint24) {
        return feeRate_;
    }
    function tickSpacing() external view override returns (uint16) {
        return getTickSize(DFLT_POOL_IDX);
    }
    function maxLiquidityPerTick() external pure override returns (uint128) {
        return TickMath.MAX_TICK_LIQUIDITY;
    }
    
    function liquidity() external view override returns (uint128) {
        return activeLiquidity(DFLT_POOL_IDX);
    }

    function initialize (uint160 price) external override {
        initPrice(DFLT_POOL_IDX, price);
        int24 tick = TickMath.getTickAtSqrtRatio(price);
        emit Initialize(price, tick);
    }

    function slot0() external view override returns
        (uint160 sqrtPriceX96, int24 tick, uint8 feeProtocol, bool unlocked) {
        (sqrtPriceX96, tick) = loadPriceTick(DFLT_POOL_IDX);
        feeProtocol = protocolCut_;
        unlocked = !reEntrantLocked_;
    }


    /* @notice Mints new concentrated liquidity into the pool, either creating a new 
     *         position or adding liquidity to a previously existing position.
     * @dev Note that msg.sender address must support IUniswapV3MintCallback methods.
     *
     * @param owner The address which will own the staked liquidity.
     * @param lowerTick The tick index of the lower bound of the concentrated liquidity
     *        range. Represented as a tick index integer where (1.0001)^T equals the 
     *        price of the tick.
     * @param upperTick The tick index of the lower bound of the concentrated liquidity
     *        range. Represented as a tick index integer where (1.0001)^T equals the 
     *        price of the tick.
     * @param liqAdded The amount of stacked liquidity to be added to the pool. 
     *                 Represented as sqrt(X*Y) where X,Y are the virtual token reserves
     *                 in a constant-product AMM.
     * @param data Arbitrary byte data that will be sent to the user's internally defined
     *             callback implementation. 
     *
     * @return quoteOwed The number of quote tokens required as collateral to support
     *                   this liquidity. (Will already have been collected by the 
     *                   callback during the method run.)
     * @return baseOwed The number of base tokens required as collateral to support
     *                   this liquidity. (Will already have been collected by the 
     *                   callback during the method run.) */
    function mint (address owner, int24 lowerTick, int24 upperTick,
                   uint128 liqAdded, bytes calldata data)
        external override reEntrantLock returns (uint256 quoteOwed, uint256 baseOwed) {
        (, int24 midTick) = loadPriceTick(DFLT_POOL_IDX);

        // Insert the range order into the book and position data structures
        uint64 odometer = addBookLiq(DFLT_POOL_IDX, midTick, lowerTick, upperTick,
                                     liqAdded, tokenOdometer(DFLT_POOL_IDX));
        addPosLiq(owner, DFLT_POOL_IDX, lowerTick, upperTick, liqAdded, odometer);

        // Calculate and collect the necessary collateral from the user.
        (baseOwed, quoteOwed) = liquidityReceivable(DFLT_POOL_IDX, liqAdded,
                                                    lowerTick, upperTick);
        commitReserves(baseOwed, quoteOwed, data);
        emit Mint(msg.sender, owner, lowerTick, upperTick, liqAdded,
                  quoteOwed, baseOwed);
    }

    /* @notice Collects the required token collateral from the user as part of an
     *         add liquidity operation.
     * @params baseOwed The user's debit on the pair's base token side.
     * @params quoteOwed The user's debit on the pair's quote token side.
     * @params data Arbitrary callback data, previously passed in by the user, to be 
     *              sent to the user's callback function. */
    function commitReserves (uint256 baseOwed, uint256 quoteOwed,
                             bytes calldata data) private {
        uint256 initBase = baseOwed > 0 ? balanceBase() : 0;
        uint256 initQuote = quoteOwed > 0 ? balanceQuote() : 0;
        IUniswapV3MintCallback(msg.sender).uniswapV3MintCallback
            (quoteOwed, baseOwed, data);
        require(baseOwed == 0 || balanceBase() >= initBase.add(baseOwed), "B");
        require(quoteOwed == 0 || balanceQuote() >= initQuote.add(quoteOwed), "Q");
    }


    /* @notice Burns previously staked concentrated liqudity and returns the collateral
     *         and accumulated rewareds to the user.
     *         position or adding liquidity to a previously existing position.
     *
     * @param recipient The address to send the payout to. Note that the position paid
     *                  out will be the one tied to msg.sender, and this value may be
     *                  different.
     * @param lowerTick The tick index of the lower bound of the concentrated liquidity
     *        range. Represented as a tick index integer where (1.0001)^T equals the 
     *        price of the tick.
     * @param upperTick The tick index of the lower bound of the concentrated liquidity
     *        range. Represented as a tick index integer where (1.0001)^T equals the 
     *        price of the tick.
     * @param liqRemoved The amount of stacked liquidity to be removed from the pool. 
     *                   Represented as sqrt(X*Y) where X,Y are the virtual token 
     *                   reserves in a constant-product AMM.
     *
     * @return quotePaid The number of quote tokens, from collateral and rewards, paid
     *                   out to the receipient from burning this liquidity. (Note that
     *                   these tokens will have already been sent after this method
     *                   completes.)
     * @return basePaid The number of base tokens, from collateral and rewards, paid
     *                   out to the receipient from burning this liquidity. */
    function burn (address recipient, int24 lowerTick, int24 upperTick,
                   uint128 liqRemoved)
        external override reEntrantLock returns (uint256 quotePaid, uint256 basePaid) {
        (, int24 midTick) = loadPriceTick(DFLT_POOL_IDX);

        // Remember feeMileage is the *global* liquidity growth in the range. We still
        // have to adjust for the growth that occured before the order was created.
        uint64 feeMileage = removeBookLiq(DFLT_POOL_IDX, midTick, lowerTick, upperTick,
                                          liqRemoved, tokenOdometer(DFLT_POOL_IDX));

        // Return the range order's original committed liquidity inflated by its
        // cumulative rewards
        uint64 rewards = burnPosLiq(msg.sender, DFLT_POOL_IDX, lowerTick, upperTick,
                                    liqRemoved, feeMileage);
        (basePaid, quotePaid) = liquidityPayable(DFLT_POOL_IDX, liqRemoved,
                                                 rewards, lowerTick, upperTick);
        if (basePaid > 0) {
            TransferHelper.safeTransfer(tokenBase_, recipient, basePaid);
        }
        if (quotePaid > 0) {
            TransferHelper.safeTransfer(tokenQuote_, recipient, quotePaid);
        }
        emit Burn(msg.sender, recipient, lowerTick, upperTick, liqRemoved,
                  quotePaid, basePaid);
    }
    

    /* @notice Uses the liquidity in the pool to convert tokens from one side of the
     *         pair to the opposite type of tokens. 
     * @dev Note that msg.sender address must support IUniswapV3SwapCallback methods.
     *
     * @param recipient The address that the pool will send the tokens to.
     * @param quoteToBase If true the swap will collect quote tokens from the user and
     *                    pay out base tokens. (I.e. a "sell" that pushes the price down)
     * @param qty The size of the swap in number of tokens. If negative, then the swap
     *            is denominated in terms of "output" tokens to be received by the user.
     *            If positive, then denominated on the "input" token side being paid by
     *            the user.
     * @param limitPrice Used to cap the price the user pays in the swap. Represents the
     *    worst possible final price of the pool. Any impact beyond this is not executed
     *    regardless of the amount of qty left. Worst is defined relative to the 
     *    direction the swap. Note that the limit price is defined in terms of the final
     *    price of the pool, *not* the realized price of the swap. The latter will
     *    always occur at a better price than the former. So this can be seen as a 
     *    relatively tight upper bound on the realized swap price (excluding exchange
     *    fee costs.)
     * @param data Arbitrary calldata supplied by the user that is fed back into the
     *             calling contract's swap callback function.
     *
     * @param quoteFlow - The amount of quote tokens exchanged in the swap. Negative
     *                    indicates tokens paid from the pool to the recipient.
     * @param baseFlow - The amount of base tokens exchanged in the swap. */
    function swap (address recipient, bool quoteToBase, int256 qty,
                   uint160 limitPrice, bytes calldata data)
        external override reEntrantLock returns (int256 quoteFlow, int256 baseFlow) {

        /* A swap operation is a potentially long and iterative process that
         * repeatedly writes updates data on both the curve state and the swap
         * accumulator. To conserve gas, the strategy is to initialize and track
         * these structures in memory. Then only commit them back to EVM storage
         * when the operation is finalized. */
        CurveMath.CurveState memory curve = snapCurve(DFLT_POOL_IDX);
        CurveMath.SwapFrame memory cntx = CurveMath.SwapFrame
            ({isBuy_: !quoteToBase,
                    inBaseQty_: (qty < 0) ? quoteToBase : !quoteToBase,
                    feeRate_: feeRate_, protoCut_: protocolCut_});
        CurveMath.SwapAccum memory accum = CurveMath.SwapAccum
            ({qtyLeft_: qty < 0 ? uint256(-qty) : uint256(qty),
                    cntx_: cntx, paidBase_: 0, paidQuote_: 0, paidProto_: 0});

        sweepSwapLiq(curve, accum, limitPrice);
        commitSwapCurve(DFLT_POOL_IDX, curve);
        accumProtocolFees(accum);
        settleSwapFlows(recipient, curve, accum, data);
        (quoteFlow, baseFlow) = (accum.paidQuote_, accum.paidBase_);
    }


    /* @notice Executes the pending swap through the order book, adjusting the
     *         liquidity curve and level book as needed based on the swap's impact.
     *
     * @dev This is probably the most complex single function in the codebase. For
     *      small local moves, which don't cross extant levels in the book, it acts
     *      like a constant-product AMM curve. For large swaps which cross levels,
     *      it iteratively re-adjusts the AMM curve on every level cross, and performs
     *      the necessary book-keeping on each crossed level entry.
     *
     * @param curve The starting liquidity curve state. Any changes created by the 
     *              swap on this struct are updated in memory. But the caller is 
     *              responsible for committing the final state to EVM storage.
     * @param accum The specification for the executable swap. The realized flows
     *              on the swap will be written into the memory-based accumulator
     *              fields of this struct. The caller is responsible for paying and
     *              collecting those flows.
     * @param limitPrice The limit price of the swap. Expressed as the square root of
     *     the price in FixedPoint96. Important to note that this represents the limit
     *     of the final price of the *curve*. NOT the realized VWAP price of the swap.
     *     The swap will only ever execute up the maximum size which would keep the curve
     *     price within this bound, even if the specified quantity is higher. */
    function sweepSwapLiq (CurveMath.CurveState memory curve,
                           CurveMath.SwapAccum memory accum,
                           uint160 limitPrice) internal {
        bool isBuy = accum.cntx_.isBuy_;
        int24 midTick = TickMath.getTickAtSqrtRatio(curve.priceRoot_);
        
        // Keep iteratively executing more quantity until we either reach our limit price
        // or have zero quantity left to execute.
        while (hasSwapLeft(curve, accum, limitPrice)) {
            // Swap to furthest point we can based on the local bitmap. Don't bother
            // seeking a bump outside the bump, because we're not sure if the swap will
            // exhaust the bitmap. 
            (int24 bumpTick, bool spillsOver) = pinTickMap(DFLT_POOL_IDX, isBuy, midTick);
            curve.swapToLimit(accum, bumpTick, limitPrice);

            // The swap can be in one of three states at this point: 1) qty exhausted,
            // 2) limit price reached, or 3) AMM liquidity bump hit. The former two mean
            // the swap is complete. The latter means that we have adust AMM liquidity,
            // and find the next liquidity bump.
            bool atBump = hasSwapLeft(curve, accum, limitPrice);
            
            // The swap can be in one of three states at this point: 1) qty exhausted,
            // 2) limit price reached, or 3) AMM liquidity bump hit. The former two mean
            // the swap is complete. The latter means that we have adust AMM liquidity,
            // and find the next liquidity bump.
            if (atBump) {

                // The spills over variable indicates that we reaced the end of the
                // local bitmap, rather than actually hitting a level bump. Therefore
                // we should query the global bitmap, find the next level bitmap, and
                // keep swapping on the constant-product curve until we hit point.
                if (spillsOver) {
                    (int24 liqTick, bool tightSpill) = seekTickSpill(DFLT_POOL_IDX,
                                                                     bumpTick, isBuy);
                    bumpTick = liqTick;
                    
                    // In some corner cases the local bitmap border also happens to
                    // be the next level bump. In which case we're done. Otherwise,
                    // we keep swapping since we still have some distance on the curve
                    // to cover.
                    if (!tightSpill) {
                        curve.swapToLimit(accum, bumpTick, limitPrice);
                        atBump = hasSwapLeft(curve, accum, limitPrice);
                    }
                }
                
                // Perform book-keeping related to crossing the level bump, update
                // the locally tracked tick of the curve price (rather than wastefully
                // we calculating it since we already know it), then begin the swap
                // loop again.
                if (atBump) {
                    midTick = knockInTick(bumpTick, isBuy, curve, accum);
                }
            }
        }
    }

    function hasSwapLeft (CurveMath.CurveState memory curve,
                          CurveMath.SwapAccum memory accum,
                          uint160 limitPrice) private pure returns (bool) {
        return accum.qtyLeft_ > 0 &&
            inLimitPrice(curve.priceRoot_, limitPrice, accum.cntx_.isBuy_);
    }
    
    function inLimitPrice (uint160 price, uint160 limitPrice, bool isBuy)
        private pure returns (bool) {
        return isBuy ? price < limitPrice : price > limitPrice;
    }


    /* @notice Performs all the necessary book keeping related to crossing an extant 
     *         level bump on the curve. 
     *
     * @dev Note that this function updates the level book data structure directly on
     *      the EVM storage. But it only updates the liquidity curve state *in memory*.
     *      This is for gas efficiency reasons, as the same curve struct may be updated
     *      many times in a single swap. The caller must take responsibility for 
     *      committing the final curve state back to EVM storage. 
     *
     * @params bumpTick The tick index where the bump occurs.
     * @params isBuy The direction the bump happens from. If true, curve's price is 
     *               moving through the bump starting from a lower price and going to a
     *               higher price. If false, the opposite.
     * @params curve The pre-bump state of the local constant-product AMM curve. Updated
     *               to reflect the liquidity added/removed from rolling through the
     *               bump.
     * @return The tick index that the curve and its price are living in after the call
     *         completes. */
    function knockInTick (int24 bumpTick, bool isBuy,
                          CurveMath.CurveState memory curve,
                          CurveMath.SwapAccum memory accum) private returns (int24) {
        if (!Bitmaps.isTickFinite(bumpTick)) { return bumpTick; }
        bumpLiquidity(bumpTick, isBuy, curve);
        curve.shaveAtBump(accum);
        return postBumpTick(bumpTick, isBuy);
    }

    function bumpLiquidity (int24 bumpTick, bool isBuy,
                            CurveMath.CurveState memory curve) private {
        int256 liqDelta = crossLevel(DFLT_POOL_IDX, bumpTick, isBuy,
                                     curve.accum_.concTokenGrowth_);
        curve.liq_.concentrated_ = LiquidityMath.addDelta
            (curve.liq_.concentrated_, liqDelta.toInt128());
    }
    
    // When selling down, the next tick leg actually occurs *below* the bump tick
    // because the bump barrier is the first price on a tick. 
    function postBumpTick (int24 bumpTick, bool isBuy) private pure returns (int24) {
        return isBuy ? bumpTick : bumpTick - 1; 
    }

    function settleSwapFlows (address recipient,
                              CurveMath.CurveState memory curve,
                              CurveMath.SwapAccum memory accum,
                              bytes calldata data) internal {
        if (accum.cntx_.isBuy_) {
            if (accum.paidQuote_ < 0) {
                TransferHelper.safeTransfer(tokenQuote_, recipient,
                                            uint256(-accum.paidQuote_));
            }
            
            uint256 initBase = balanceBase();
            IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback
                (accum.paidQuote_, accum.paidBase_, data);
            require(initBase.add(uint256(accum.paidBase_)) <= balanceBase(), "B");
            
        } else {
            if (accum.paidBase_ < 0) {
                TransferHelper.safeTransfer(tokenBase_, recipient,
                                            uint256(-accum.paidBase_));
            }

            uint256 initQuote = balanceQuote();
            IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback
                (accum.paidQuote_, accum.paidBase_, data);
            require(initQuote.add(uint256(accum.paidQuote_)) <= balanceQuote(), "Q");
        }
        
        emit Swap(msg.sender, recipient, accum.paidQuote_, accum.paidBase_,
                  curve.priceRoot_, TickMath.getTickAtSqrtRatio(curve.priceRoot_));
    }

    /* @notice Transfer ownership of a concentrated liquidity position from sender 
     *         address to another. Range, liquidity, and accumulated rewards remain 
     *         unchanged.
     * @dev    Note that the receipient must have no position active at the range, 
     *         otherwise the transfer will fail.
     * @param recipient The address who will own the position after the transfer.
     * @param lowerTick The tick index of the lower bound of the range for the 
     *        concentrated liquidity position. 
     * @param upperTick The tick index of the upper bound of the range for the
     *        concentrated liquidity position. */
    function transfer (address receipient, int24 lowerTick, int24 upperTick) external {
        changePosOwner(msg.sender, receipient, DFLT_POOL_IDX, lowerTick, upperTick);
        emit Transfer(msg.sender, receipient, lowerTick, upperTick);
    }
    
    // @inheritdoc ICrocSwapV3PoolOwnerActions   
    function setFeeProtocol (uint8 protocolFee)
        protocolAuth external override { protocolCut_ = protocolFee; }

    // @inheritdoc ICrocSwapV3PoolOwnerActions  
    function collectProtocol (address recipient)
        protocolAuth external override returns (uint128, uint128) {
        (uint128 baseFees, uint128 quoteFees) = disburseProtocol
            (recipient, tokenBase_, tokenQuote_);
        emit CollectProtocol(msg.sender, recipient, quoteFees, baseFees);
        return (quoteFees, baseFees);
    }

    // @inheritdoc ICrocSwapV3PoolState
    function protocolFees() external view override returns (uint128, uint128) {
        (uint128 baseFees, uint128 quoteFees) = protoFeeAccum();
        return (quoteFees, baseFees);
    }
    
    modifier protocolAuth() {
        require(msg.sender == ICrocSwapFactory(factory_).owner(), "PA");
        require(reEntrantLocked_ == false, "A");
        reEntrantLocked_ = true;
        _;
        reEntrantLocked_ = false;
    }
    
    modifier reEntrantLock() {
        require(reEntrantLocked_ == false, "A");
        reEntrantLocked_ = true;
        _;
        reEntrantLocked_ = false;
    }
    
    
    function balanceBase() private view returns (uint256) {
        return IERC20Minimal(tokenBase_).balanceOf(address(this));
    }
    
    function balanceQuote() private view returns (uint256) {
        return IERC20Minimal(tokenQuote_).balanceOf(address(this));
    }
    
    address private immutable factory_;
    address private immutable tokenBase_;
    address private immutable tokenQuote_;
    
    uint24 private immutable feeRate_;
    uint8 private protocolCut_;
    
    bool private reEntrantLocked_;

    uint8 constant DFLT_POOL_IDX = 0;
}
