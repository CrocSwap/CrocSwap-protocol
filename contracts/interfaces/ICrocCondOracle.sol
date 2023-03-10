// SPDX-License-Identifier: GPL-3 

pragma solidity 0.8.19;

/* @title Croc conditional oracle interface
 * @notice Defines a generalized interface for checking an arbitrary condition. Used in
 *         an off-chain relayer context. User can gate specific order on a runtime 
 *         condition by calling to the oracle. */
interface ICrocNonceOracle {

    /* @notice Oracle function that tests a condition.
     *
     * @param user The address of the underlying call.
     * @param nonceSalt The salt of the nonce being reset on this call. Implementations
     *                  can either ignore, or use it to check call-specific conditions.
     * @param nonce The new nonce value that will be set for the user at the salt, if the
     *              oracle returns true. Presumably this nonce will open a secondary order
     *              executes some desired action.
     * @param args Arbitrary args supplied to oracle check call.
     *
     * @return True if the condition is met. If false, CrocSwap will revert the 
     *         transaction, and the nonce will not be reset. */
    function checkCrocNonceSet (address user, bytes32 nonceSalt, uint32 nonce,
                                bytes calldata args) external returns (bool);
}

interface ICrocCondOracle {
    function checkCrocCond (address user, bytes calldata args) external returns (bool);
}
