// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import './LowGasSafeMath.sol';

/* @title Pool specification library */
library PoolSpecs {

    struct PoolSpec {
        uint24 feeRate_;
        uint8 protocolTake_;
        uint8 tickSpacing_;
    }

    uint constant MAX_POOL_COUNT = 256;
}
