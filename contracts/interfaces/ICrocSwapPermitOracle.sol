// SPDX-License-Identifier: Unlicensed 

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';

/* @notice Standard interface for a permit oracle to be used by a permissioned pool. */
interface ICrocSwapPermitOracle {

    /* @notice Verifies whether a given user is permissioned to perform an action
     *         on the pool.
     * @param user The address of the caller to the contract.
     * @param base The base-side token in the pair.
     * @param quote The quote-side token in the pair.
     * @param tradeCode Simple code representing the type of action being perfomed by
     *                  the user: (1/Swap, 2/Mint, 3/Burn, 4/Multiple) */
    function isApprovedForCrocPool (address user, address base, address quote,
                                    uint8 tradeCode)
        external view returns (bool);
}
