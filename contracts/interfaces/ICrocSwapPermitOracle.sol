// SPDX-License-Identifier: Unlicensed 

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';

interface ICrocSwapPermitOracle {

    function isApprovedForCrocPool (address user, address base, address quote,
                                    uint8 tradeCode)
        external view returns (bool);
}
