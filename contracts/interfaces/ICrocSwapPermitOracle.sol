// SPDX-License-Identifier: Unlicensed 

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';

interface ICrocSwapPermitOracle {

    function isApprovedForCrocPool (address user, address base, address quote,
                                    Directives.PoolDirective memory)
        external view returns (bool);
}
