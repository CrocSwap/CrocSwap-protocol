// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;

import "../interfaces/IERC20Minimal.sol";
import "../CrocSwapPool.sol";
import "hardhat/console.sol";

contract TestPool is IUniswapV3MintCallback, IUniswapV3SwapCallback {
    using TickMath for uint160;

    bytes public testCalldata;
    bytes public snapCalldata;
    
    uint256 public snapBaseOwed;
    uint256 public snapQuoteOwed;
    int256 public snapBaseFlow;
    int256 public snapQuoteFlow;
    uint256 public snapBaseMint;
    uint256 public snapQuoteMint;
    uint256 public snapBaseBurn;
    uint256 public snapQuoteBurn;
    int256 public snapBaseSwap;
    int256 public snapQuoteSwap;

    uint256 public debtHaircutQuote;
    uint256 public debtHaircutBase;
    
    address public pool;
    address public base;
    address public quote;
    
    constructor (address poolAddr, address quoteAddr, address baseAddr) {
        pool = poolAddr;
        base = baseAddr;
        quote = quoteAddr;
    }
    
    function testSwap (bool isBuy, int256 qty, uint160 limitPrice) public {
        (snapQuoteSwap, snapBaseSwap) = CrocSwapPool(pool).swap
            (address(this), isBuy, qty, limitPrice, testCalldata);
    }

    function testMint (int24 lowerTick, int24 upperTick, uint128 liqAdded) public {
        (snapQuoteMint, snapBaseMint) = CrocSwapPool(pool).mint
            (address(this), lowerTick, upperTick, liqAdded, testCalldata);
    }

    function testBurn (int24 lowerTick, int24 upperTick, uint128 liqBurn) public {
        (snapQuoteBurn, snapBaseBurn) = CrocSwapPool(pool).burn
            (address(this), lowerTick, upperTick, liqBurn);
    }

    function testProtocolSetFee (uint8 protoFee) public {
        CrocSwapPool(pool).setFeeProtocol(protoFee);
    }

    function testProtocolCollect (address recv) public {
        CrocSwapPool(pool).collectProtocol(recv);
    }
    
    function setDebtHaircut (uint256 quoteShort, uint256 baseShort) public {
        debtHaircutQuote = quoteShort;
        debtHaircutBase = baseShort;
    }

    function setCalldata (bytes calldata data) public {
        testCalldata = data;
    }
    
    function uniswapV3MintCallback (uint256 quoteOwed, uint256 baseOwed,
                                    bytes calldata data) override public {
        snapBaseOwed = baseOwed;
        snapQuoteOwed = quoteOwed;
        snapCalldata = data;

        if (baseOwed > 0) {
            IERC20Minimal(base).transfer(pool, baseOwed - debtHaircutBase);
        }
        if (quoteOwed > 0) {
            IERC20Minimal(quote).transfer(pool, quoteOwed - debtHaircutQuote);
        }
    }

    function uniswapV3SwapCallback (int256 quoteFlow, int256 baseFlow,
                                    bytes calldata data) override public {
        snapBaseFlow = baseFlow;
        snapQuoteFlow = quoteFlow;
        snapCalldata = data;

        if (baseFlow > 0) {
            IERC20Minimal(base).transfer(pool, uint256(baseFlow) - debtHaircutBase);
        }
        if (quoteFlow > 0) {
            IERC20Minimal(quote).transfer(pool, uint256(quoteFlow) - debtHaircutQuote);
        }
    }
}

