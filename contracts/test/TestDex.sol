// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "../interfaces/IERC20Minimal.sol";
import "../CrocSwapDex.sol";

contract TestDex {
    using TickMath for uint128;

    address public dex;

    constructor (address dexAddr) {
        dex = dexAddr;
    }

    
}

