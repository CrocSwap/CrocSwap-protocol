// SPDX-License-Identifier: GPL-3 

pragma solidity ^0.8.4;

/* @title Croc Virtual Token controller.
 *
 * @notice This interface can be used to support the use of "virtual tokens" inside 
 *         CrocSwapDex, in a way that isn't tied to the ERC20 implementation. Virtual
 *         tokens require all trading inside Croc to be done with the user's surplus 
 *         collateral balance. Any direct deposits or withdraws run through this
 *         virtual token tracker, which gives implementations total freedom to
 *         define how virtual token balances assigned. */
interface ICrocVirtualToken {

    /* @notice Request for depositing a fixed number of virtual tokens into a user's
     *         Croc surplus liquidity balance. 
     *
     * @dev    For security reasons implementations should only ever allow this function
     *         to be called by the CrocSwapDex contract. CrocSwap contract will internally
     *         verify the user has authorized the call, and update its own surplus 
     *         liquidity balance.
     *
     * @param user The underlying user, who's claiming the deposit.
     * @param tokenSalt The salt mapping the virtual token. The address of the virtual
     *                  token inside croc will be the first 160 bits of the keccak256
     *                  hash of this tracker's address and this salt. That assures that
     *                  virtual tokens are deterministic, only owned by on virtual 
     *                  tracker, and that a single tracker can support arbitrary number
     *                  of different virtual tokens.
     * @param value  The value the user requests to deposit to Croc.
     * @param args   Arbitrary arguments passed by the user to this call.
     *
     * @return If true, the virtual token tracker indicates that the deposit is legal and
     *         that it's updated its internal tracking to reflect the deposit. If false,
     *         the deposit attempt will revert. */
    function depositCroc (address user, uint256 tokenSalt, uint128 value,
                          bytes calldata args) external returns (bool);

    /* @notice Request for withdrawing a fixed number of virtual tokens from a user's
     *         Croc surplus liquidity balance. 
     *
     * @dev    Like depositCroc, this method should only ever be called by CrocSwapDex 
     *         contract.
     *
     * @dev The token tracker doesn't have to concern itself with the user's Croc-side
     *      surplus liquidity balance. That will be checked inside the CrocSwapDex 
     *      contract call itself.
     *
     * @param user The underlying user, who's claiming the deposit.
     * @param tokenSalt The salt mapping the virtual token. The address of the virtual
     *                  token inside croc will be the first 160 bits of the keccak256
     *                  hash of this tracker's address and this salt. That assures that
     *                  virtual tokens are deterministic, only owned by on virtual 
     *                  tracker, and that a single tracker can support arbitrary number
     *                  of different virtual tokens.
     * @param value  The value the user wants to withdraw from Croc.
     * @param args   Arbitrary arguments passed by the user to this call.
     *
     * @return If true, the virtual token tracker indicates that the withdraw is legal and
     *         that it's updated its internal tracking to reflect the withdraw. If false,
     *         will revert. */
    function withdrawCroc (address user, uint256 tokenSalt, uint128 value,
                           bytes calldata args) external returns (bool);
}
