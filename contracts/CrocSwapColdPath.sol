// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './libraries/PriceGrid.sol';
import './mixins/CurveTrader.sol';
import './mixins/SettleLayer.sol';
import './mixins/PoolRegistry.sol';
import './mixins/OracleHist.sol';
import './mixins/CurveTrader.sol';
import './mixins/StorageLayout.sol';
import './interfaces/ICrocSwapHistRecv.sol';
import './CrocSwapBooks.sol';

import "hardhat/console.sol";

contract CrocSwapColdPath is CurveTrader, PoolRegistry, SettleLayer {

    function initPool (address base, address quote, uint24 poolIdx,
                       uint128 price) public {
        PoolSpecs.PoolCursor memory pool = registerPool(base, quote, poolIdx);
        (int128 baseFlow, int128 quoteFlow) = initCurve(pool, price, 0);
        settleInitFlow(msg.sender, base, baseFlow, quote, quoteFlow);
    }
}


contract ColdPathCaller is StorageLayout {
    function callInitPool (address base, address quote, uint24 poolIdx,  
                           uint128 price) internal {
        (bool success, ) = coldPath_.delegatecall(
            abi.encodeWithSignature("initPool(address,address,uint24,uint128)",
                                    base, quote, poolIdx, price));
        require(success, 'PI');
    }

    
}
