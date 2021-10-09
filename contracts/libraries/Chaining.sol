// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "./SafeCast.sol";
import "./PoolSpecs.sol";
import "./PriceGrid.sol";

/* @title Trade chaining library */
library Chaining {

    struct ExecutionContext {
        address owner_;
        PoolSpecs.Pool pool_;
        PriceGrid.ImproveSettings improve_;
        RollOverTarget roll_;
    }

    struct RollOverTarget {
        bool inBaseQty_;
        int256 remainingFlow_;
    }

    struct PairFlow {
        int256 baseFlow_;
        int256 quoteFlow_;
        uint256 baseProto_;
        uint256 quoteProto_;
    }
}
