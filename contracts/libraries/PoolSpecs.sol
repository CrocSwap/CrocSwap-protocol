// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import './LowGasSafeMath.sol';

/* @title Pool specification library */
library PoolSpecs {

    struct PoolSpecs {
        uint24 feeRate_;
        uint8 protocolTake_;
        uint8 tickSpacing_;
    };
}
