// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "./SafeCast.sol";
import "./PoolSpecs.sol";
import "./PriceGrid.sol";
import "./CurveMath.sol";

import "hardhat/console.sol";

/* @title Trade chaining library */
library Chaining {

    struct ExecCntx {
        address owner_;
        address oracle_;
        PoolSpecs.PoolCursor pool_;
        PriceGrid.ImproveSettings improve_;
        RollTarget roll_;
    }

    struct RollTarget {
        bool inBaseQty_;
        int256 rollTarget_;
    }

    struct PairFlow {
        int256 baseFlow_;
        int256 quoteFlow_;
        uint256 baseProto_;
        uint256 quoteProto_;
    }

    function buildCntx (PoolSpecs.PoolCursor memory pool,
                        PriceGrid.ImproveSettings memory improve)
        internal view returns (ExecCntx memory) {
        RollTarget memory roll = RollTarget({inBaseQty_: false, rollTarget_: 0});
        return ExecCntx({owner_: msg.sender, oracle_: address(this),
                    pool_: pool, improve_: improve, roll_: roll});
    }
    
    function initFlow() internal pure returns (PairFlow memory) {
        return PairFlow({baseFlow_: 0, quoteFlow_: 0, baseProto_: 0, quoteProto_: 0});
    }
    
    function accumSwap (PairFlow memory flow, CurveMath.SwapAccum memory accum)
        internal pure {
        accumFlow(flow, accum.paidBase_, accum.paidQuote_);
        if (accum.cntx_.inBaseQty_) {
            flow.quoteProto_ += accum.paidProto_;
        } else {
            flow.baseProto_ += accum.paidProto_;
        }
    }

    function accumFlow (PairFlow memory flow, int256 base, int256 quote)
        internal pure {
        flow.baseFlow_ += base;
        flow.quoteFlow_ += quote;
    }

    function foldFlow (PairFlow memory obj, PairFlow memory flow) internal pure {
        obj.baseFlow_ += flow.baseFlow_;
        obj.quoteFlow_ += flow.quoteFlow_;
        obj.baseProto_ += flow.baseProto_;
        obj.quoteProto_ += flow.quoteProto_;
    }
}
