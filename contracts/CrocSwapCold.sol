// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './libraries/PriceGrid.sol';
import './mixins/SettleLayer.sol';
import './mixins/PoolRegistry.sol';
import './mixins/OracleHist.sol';
import './mixins/Sequencer.sol';
import './mixins/StorageLayout.sol';
import './mixins/ProtocolAccount.sol';
import './interfaces/ICrocSwapHistRecv.sol';

import "hardhat/console.sol";

contract CrocSwapColdPath is Sequencer, PoolRegistry, SettleLayer, ProtocolAccount {
    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;


    function initPool (address base, address quote, uint24 poolIdx,
                       uint128 price) public {
        PoolSpecs.PoolCursor memory pool = registerPool(base, quote, poolIdx);
        (int128 baseFlow, int128 quoteFlow) = initCurve(pool, price, 0);
        settleInitFlow(msg.sender, base, baseFlow, quote, quoteFlow);
    }

}

