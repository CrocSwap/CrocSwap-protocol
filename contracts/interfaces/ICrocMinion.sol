// SPDX-License-Identifier: Unlicensed 

pragma solidity >=0.8.4;

import '../libraries/CurveCache.sol';

/* @notice Simple interface that defines the surface between the CrocSwapDex
 *         itself and protocol governance. All governance is executed through
 *         the protocolCmd() method. */
interface ICrocMinion {
    function protocolCmd (bytes calldata input) external;
}
