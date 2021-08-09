// SPDX-License-Identifier: Unlicensed

pragma solidity >0.7.1;

import './interfaces/ICrocSwapPool.sol';

import './libraries/LowGasSafeMath.sol';
import './libraries/SafeCast.sol';

import './libraries/FixedPoint128.sol';
import './libraries/TransferHelper.sol';
import './libraries/TickMath.sol';
import './libraries/LiquidityMath.sol';
import './libraries/CurveMath.sol';
import './libraries/SwapCurve.sol';

import './interfaces/ICrocSwapFactory.sol';
import './interfaces/IERC20Minimal.sol';
import './interfaces/callback/IUniswapV3MintCallback.sol';
import './interfaces/callback/IUniswapV3SwapCallback.sol';

import './mixins/TickCensus.sol';
import './mixins/PositionRegistrar.sol';
import './mixins/LiquidityCurve.sol';
import './mixins/LevelBook.sol';
import './mixins/ProtocolAccount.sol';

import "hardhat/console.sol";

contract CrocSwapPool is ICrocSwapPool,
    PositionRegistrar, LiquidityCurve, LevelBook, ProtocolAccount {
    
    using LowGasSafeMath for uint256;
    using LowGasSafeMath for int256;
    using SafeCast for uint256;
    using SafeCast for int256;
    using SwapCurve for CurveMath.CurveState;
    using CurveMath for CurveMath.CurveState;

    address private immutable factory_;
    address private immutable tokenBase_;
    address private immutable tokenQuote_;
    uint24 private immutable feeRate_;

    uint8 private protocolCut_;    

    bool private reEntrantLocked_;    

    
    constructor (address factoryRef, address tokenQuote, address tokenBase,
                 uint24 feeRate, int24 tickUnits) {
        (factory_, tokenBase_, tokenQuote_, feeRate_) =
            (factoryRef, tokenBase, tokenQuote, feeRate);
        setTickSize(tickUnits);
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
    function tickSpacing() external view override returns (int24) {
        return getTickSize();
    }
    function maxLiquidityPerTick() external pure override returns (uint128) {
        return TickMath.MAX_TICK_LIQUIDITY;
    }
    
    function liquidity() external view override returns (uint128) {
        return activeLiquidity();
    }
    
    function tickBitmap (int16 wordPosition)
        external view override returns (uint256) {
        return mezzanineBitmap(wordPosition);
    }

    
    function initialize (uint160 price) external override {
        initPrice(price);
        int24 tick = TickMath.getTickAtSqrtRatio(price);
        emit Initialize(price, tick);
    }

    function slot0() external view override returns
        (uint160 sqrtPriceX96, int24 tick, uint8 feeProtocol, bool unlocked) {
        (sqrtPriceX96, tick) = loadPriceTick();
        feeProtocol = protocolCut_;
        unlocked = !reEntrantLocked_;
    }


    function mint (address owner, int24 lowerTick, int24 upperTick,
                   uint128 liqAdded, bytes calldata data)
        external override reEntrantLock returns (uint256 quoteOwed, uint256 baseOwed) {
        (, int24 midTick) = loadPriceTick();
        uint256 odometer = addBookLiq(midTick, lowerTick, upperTick,
                                      liqAdded, tokenOdometer());

        addPosLiq(owner, lowerTick, upperTick, liqAdded, odometer);
        (baseOwed, quoteOwed) = liquidityReceivable(liqAdded, lowerTick, upperTick);
        commitReserves(baseOwed, quoteOwed, data);
        emit Mint(msg.sender, owner, lowerTick, upperTick, liqAdded,
                  quoteOwed, baseOwed);
    }

    function commitReserves (uint256 baseOwed, uint256 quoteOwed,
                             bytes calldata data) private {
        uint256 initBase = baseOwed > 0 ? balanceBase() : 0;
        uint256 initQuote = quoteOwed > 0 ? balanceQuote() : 0;
        IUniswapV3MintCallback(msg.sender).uniswapV3MintCallback
            (quoteOwed, baseOwed, data);
        require(baseOwed == 0 || balanceBase() >= initBase.add(baseOwed), "B");
        require(quoteOwed == 0 || balanceQuote() >= initQuote.add(quoteOwed), "Q");
    }

    
    function burn (address recipient, int24 lowerTick, int24 upperTick,
                   uint128 liqRemoved)
        external override reEntrantLock returns (uint256 quotePaid, uint256 basePaid) {
        (, int24 midTick) = loadPriceTick();
        uint256 feeMileage =
            removeBookLiq(midTick, lowerTick, upperTick, liqRemoved, tokenOdometer());
        
        uint256 rewards = burnPosLiq(msg.sender, lowerTick, upperTick,
                                     liqRemoved, feeMileage);
        (basePaid, quotePaid) = liquidityPayable(liqRemoved, uint128(rewards),
                                                  lowerTick, upperTick);

        if (basePaid > 0) {
            TransferHelper.safeTransfer(tokenBase_, recipient, basePaid);
        }
        if (quotePaid > 0) {
            TransferHelper.safeTransfer(tokenQuote_, recipient, quotePaid);
        }
        emit Burn(msg.sender, recipient, lowerTick, upperTick, liqRemoved,
                  quotePaid, basePaid);
    }
    

    function swap (address recipient, bool quoteToBase, int256 qty,
                   uint160 limitPrice, bytes calldata data)
        external override reEntrantLock returns (int256, int256) {

        CurveMath.CurveState memory curve = snapCurve();
        CurveMath.SwapFrame memory cntx = CurveMath.SwapFrame
            ({isBuy_: !quoteToBase,
                    inBaseQty_: (qty < 0) ? quoteToBase : !quoteToBase,
                    feeRate_: feeRate_, protoCut_: protocolCut_});
        CurveMath.SwapAccum memory accum = CurveMath.SwapAccum
            ({qtyLeft_: qty < 0 ? uint256(-qty) : uint256(qty),
                    cntx_: cntx, paidBase_: 0, paidQuote_: 0, paidProto_: 0});

        sweepSwapLiq(curve, accum, limitPrice);
        commitSwapCurve(curve);
        accumProtocolFees(accum);
        settleSwapFlows(recipient, curve, accum, data);
        
        return (accum.paidQuote_, accum.paidBase_);
    }

    
    function sweepSwapLiq (CurveMath.CurveState memory curve,
                           CurveMath.SwapAccum memory accum,
                           uint160 limitPrice) internal {
        bool isBuy = accum.cntx_.isBuy_;
        int24 midTick = TickMath.getTickAtSqrtRatio(curve.priceRoot_);
        uint256 mezzBitmap = mezzanineBitmap(midTick);

        while (hasSwapLeft(curve, accum, limitPrice)) {
            (int24 bumpTick, bool spillsOver) = pinBitmap(isBuy, midTick, mezzBitmap);
            curve.swapToLimit(accum, bumpTick, limitPrice);

            if (hasSwapLeft(curve, accum, limitPrice)) {
                if (spillsOver) {
                    int24 borderTick = bumpTick;
                    (bumpTick, mezzBitmap) = seekMezzSpill(borderTick, isBuy);
                    if (bumpTick != borderTick) {
                        curve.swapToLimit(accum, bumpTick, limitPrice);
                    }
                }
                
                knockInTick(bumpTick, isBuy, curve);
                midTick = bumpTick;
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

    function knockInTick (int24 bumpTick, bool isBuy,
                          CurveMath.CurveState memory curve) internal {
        if (Bitmaps.isTickFinite(bumpTick)) {
            int256 liqDelta = crossLevel(bumpTick, isBuy,
                                         curve.accum_.concTokenGrowth_);
            curve.liq_.concentrated_ = LiquidityMath.addDelta
                (curve.liq_.concentrated_, liqDelta.toInt128());
        }
    }

    
    function settleSwapFlows (address recipient,
                              CurveMath.CurveState memory curve,
                              CurveMath.SwapAccum memory accum,
                              bytes calldata data) internal {
        if (accum.cntx_.isBuy_) {
            if (accum.paidQuote_ < 0)
                TransferHelper.safeTransfer(tokenQuote_, recipient,
                                            uint256(-accum.paidQuote_));
            
            uint256 initBase = balanceBase();
            IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback
                (accum.paidQuote_, accum.paidBase_, data);
            require(initBase.add(uint256(accum.paidBase_)) <= balanceBase(), "B");
        } else {
            if (accum.paidBase_ < 0)
                TransferHelper.safeTransfer(tokenBase_, recipient,
                                            uint256(-accum.paidBase_));
            
            uint256 initQuote = balanceQuote();
            IUniswapV3SwapCallback(msg.sender).uniswapV3SwapCallback
                (accum.paidQuote_, accum.paidBase_, data);
            require(initQuote.add(uint256(accum.paidQuote_)) <= balanceQuote(), "Q");
        }
        
        emit Swap(msg.sender, recipient, accum.paidQuote_, accum.paidBase_,
                  curve.priceRoot_, TickMath.getTickAtSqrtRatio(curve.priceRoot_));
    }
    
    
    function setFeeProtocol (uint8 protocolFee)
        protocolAuth external override { protocolCut_ = protocolFee; }

    function collectProtocol (address recipient)
        protocolAuth external override returns (uint128, uint128) {
        (uint128 baseFees, uint128 quoteFees) = disburseProtocol
            (recipient, tokenBase_, tokenQuote_);
        emit CollectProtocol(msg.sender, recipient, quoteFees, baseFees);
        return (quoteFees, baseFees);
    }

    function protocolFees() external view override returns (uint128, uint128) {
        (uint128 baseFees, uint128 quoteFees) = protoFeeAccum();
        return (quoteFees, baseFees);
    }

    modifier protocolAuth() {
        require(msg.sender == ICrocSwapFactory(factory_).owner());
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


}
