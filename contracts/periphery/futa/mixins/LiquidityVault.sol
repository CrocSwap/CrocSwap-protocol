// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.19;

import "../../../libraries/TransferHelper.sol";
import "../../../libraries/PoolSpecs.sol";
import "../../../libraries/ProtocolCmd.sol";
import "../../../mixins/StorageLayout.sol";
import "../../../CrocSwapDex.sol";
import "../../../lens/CrocQuery.sol";
import "../../../interfaces/IERC20Minimal.sol";

import "./FutaBase.sol";

contract LiquidityVault is FutaBase {

    function lockLiquidity(address token, uint128 auctionPrice) internal {
        initializePool(token, auctionPrice);
        mintAmbientLiquidity(token);
        mintSingleSideLiquidity(token);
    }

    function initializePool(address token, uint128 auctionPrice) private {
        bytes memory cmd = abi.encode(UserCmd.INIT_POOL_CODE, address(0), token, poolIdx_, auctionPrice);
        CrocSwapDex(tradingDex_).userCmd{value: address(this).balance}(CrocSlots.COLD_PROXY_IDX, cmd);
    }

    function mintAmbientLiquidity(address token) private {
        bytes memory cmd = abi.encode(UserCmd.MINT_AMBIENT_BASE_LP, address(0), token, poolIdx_, 
            0, 0, address(this).balance, TickMath.MIN_SQRT_RATIO, TickMath.MAX_SQRT_RATIO,
            address(0), 0);
        CrocSwapDex(tradingDex_).userCmd{value: address(this).balance}(CrocSlots.LP_PROXY_IDX, cmd);
    }

    function mintSingleSideLiquidity(address token) private {
        int24 askTick = deriveAskTick(token);
        uint256 tokenBalance = IERC20Minimal(token).balanceOf(address(this));

        bytes memory cmd = abi.encode(UserCmd.MINT_RANGE_QUOTE_LP, address(0), token, poolIdx_, 
            askTick, TickMath.MAX_TICK, tokenBalance,
            TickMath.MIN_SQRT_RATIO, TickMath.MAX_SQRT_RATIO, address(0), 0);
        CrocSwapDex(tradingDex_).userCmd(CrocSlots.LP_PROXY_IDX, cmd);
    }

    function deriveAskTick (address token) private view returns (int24) {
        PoolSpecs.Pool memory pool = CrocQuery(crocQuery_).queryPoolParams(address(0), token, poolIdx_);
        int24 tick = CrocQuery(crocQuery_).queryCurveTick(address(0), token, poolIdx_);
        int24 tickSize = int24(uint24(pool.tickSize_));
        return (tick / tickSize + 1) * tickSize;
    }
}
