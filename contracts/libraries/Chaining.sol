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
    using SafeCast for int128;
    using SafeCast for uint128;
    
    struct ExecCntx {
        PoolSpecs.PoolCursor pool_;
        PriceGrid.ImproveSettings improve_;
        RollTarget roll_;
    }

    struct RollTarget {
        bool inBaseQty_;
        int128 prePairBal_;
    }

    struct PairFlow {
        int128 baseFlow_;
        int128 quoteFlow_;
        uint128 baseProto_;
        uint128 quoteProto_;
    }

    function plugSwapGap (RollTarget memory roll, PairFlow memory flow,
                          bool inBaseQty) internal pure returns
        (bool isBuy, uint128 qty) {
        require(inBaseQty == roll.inBaseQty_);
        int128 dirQty = totalBalance(roll, flow);
        isBuy = inBaseQty ? (dirQty < 0) : (dirQty > 0);
        qty = dirQty > 0 ? uint128(dirQty) : uint128(-dirQty);
    }

    function totalBalance (RollTarget memory roll, PairFlow memory flow)
        private pure returns (int128) {
        int128 pairFlow = (roll.inBaseQty_ ? flow.baseFlow_ : flow.quoteFlow_);
        return roll.prePairBal_ + pairFlow;
    }
    
    function accumSwap (PairFlow memory flow, bool inBaseQty,
                        int128 base, int128 quote, uint128 proto) internal pure {
        accumFlow(flow, base, quote);
        if (inBaseQty) {
            flow.quoteProto_ += proto;
        } else {
            flow.baseProto_ += proto;
        }
    }

    function accumFlow (PairFlow memory flow, int128 base, int128 quote)
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
