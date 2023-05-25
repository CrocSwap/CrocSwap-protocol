// SPDX-License-Identifier: GPL-3 

pragma solidity 0.8.19;

import '../libraries/Directives.sol';

/* @notice Standard interface for a permit oracle to be used by a permissioned pool. 
 * 
 * @dev For pools under their control permit oracles have the ability to approve or deny
 *      pool initialization, swaps, mints and burns for all liquidity types (ambient,
 *      concentrated and knockout). 
 * 
 *      Note that permit oracles do *not* have the ability to restrict claims or recovers 
 *      on post-knockout liquidity. An order is eligible to be claimed/recovered only after
 *      its liquidity has been knocked out of the curve, and is no longer active. Since a
 *      no longer active order does not affect the liquidity or state of the curve, permit
 *      oracles have no economic reason to restrict knockout claims/recovers. */
interface ICrocPermitOracle {

    /* @notice Verifies whether a given user is permissioned to perform an arbitrary 
     *          action on the pool.
     *
     * @param user The address of the caller to the contract.
     * @param sender The value of msg.sender for the caller of the action. Will either
     *               be same as user, the calling router, or the off-chain relayer.
     * @param base  The base-side token in the pair.
     * @param quote The quote-side token in the pair.
     * @param ambient The ambient liquidity directive for the pool action (possibly zero)
     * @param swap    The swap directive for the pool (possibly zero)
     * @param concs   The concentrated liquidity directives for the pool (possibly empty)
     * @param poolFee The effective pool fee set for the swap (either the base fee or the
     *                base fee plus user tip).
     *
     * @returns discount    Either returns 0, indicating the action is not approved at all.
     *                      Or returns the discount (in units of 0.0001%) that should be applied
     *                      to the pool's pre-existing swap fee on this call. Be aware that this value
     *                      is defined in terms of N-1 (because 0 is already used to indicate failure).
     *                      Hence return value of 1 indicates a discount of 0, return value of 2 
     *                      indicates discount of 0.0001%, return value of 3 is 0.0002%, and so on */
    function checkApprovedForCrocPool (address user, address sender,
                                       address base, address quote,
                                       Directives.AmbientDirective calldata ambient,
                                       Directives.SwapDirective calldata swap,
                                       Directives.ConcentratedDirective[] calldata concs,
                                       uint16 poolFee)
        external returns (uint16 discount);

    /* @notice Verifies whether a given user is permissioned to perform a swap on the pool
     *
     * @param user The address of the caller to the contract.
     * @param sender The value of msg.sender for the caller of the action. Will either
     *               be same as user, the calling router, or the off-chain relayer.
     * @param base The base-side token in the pair.
     * @param quote The quote-side token in the pair.
     * @param isBuy  If true, the swapper is paying base and receiving quote
     * @param inBaseQty  If true, the qty is denominated in the base token side.
     * @param qty        The full qty on the swap request (could possibly be lower if user
     *                   hits limit price.
     * @param poolFee The effective pool fee set for the swap (either the base fee or the
     *                base fee plus user tip).

     * @returns discount    Either returns 0, indicating the action is not approved at all.
     *                      Or returns the discount (in units of 0.0001%) that should be applied
     *                      to the pool's pre-existing swap fee on this call. Be aware that this value
     *                      is defined in terms of N-1 (because 0 is already used to indicate failure).
     *                      Hence return value of 1 indicates a discount of 0, return value of 2 
     *                      indicates discount of 0.0001%, return value of 3 is 0.0002%, and so on */
    function checkApprovedForCrocSwap (address user, address sender,
                                       address base, address quote,
                                       bool isBuy, bool inBaseQty, uint128 qty,
                                       uint16 poolFee)
        external returns (uint16 discount);

    /* @notice Verifies whether a given user is permissioned to mint liquidity
     *         on the pool.
     *
     * @param user The address of the caller to the contract.
     * @param sender The value of msg.sender for the caller of the action. Will either
     *               be same as user, the calling router, or the off-chain relayer.
     * @param base The base-side token in the pair.
     * @param quote The quote-side token in the pair.
     * @param bidTick  The tick index of the lower side of the range (0 if ambient)
     * @param askTick  The tick index of the upper side of the range (0 if ambient)
     * @param liq      The total amount of liquidity being minted. Denominated as 
     *                 sqrt(X*Y)
     *
     * @returns       Returns true if action is permitted. If false, CrocSwap will revert
     *                the transaction. */
    function checkApprovedForCrocMint (address user, address sender,
                                       address base, address quote,
                                       int24 bidTick, int24 askTick, uint128 liq)
        external returns (bool);

    /* @notice Verifies whether a given user is permissioned to burn liquidity
     *         on the pool.
     *
     * @param user The address of the caller to the contract.
     * @param sender The value of msg.sender for the caller of the action. Will either
     *               be same as user, the calling router, or the off-chain relayer.
     * @param base The base-side token in the pair.
     * @param quote The quote-side token in the pair.
     * @param bidTick  The tick index of the lower side of the range (0 if ambient)
     * @param askTick  The tick index of the upper side of the range (0 if ambient)
     * @param liq      The total amount of liquidity being minted. Denominated as 
     *                 sqrt(X*Y)
     *
     * @returns       Returns true if action is permitted. If false, CrocSwap will revert
     *                the transaction. */
    function checkApprovedForCrocBurn (address user, address sender,
                                       address base, address quote,
                                       int24 bidTick, int24 askTick, uint128 liq)
        external returns (bool);

    /* @notice Verifies whether a given user is permissioned to initialize a pool
     *         attached to this oracle.
     *
     * @param user The address of the caller to the contract.
     * @param sender The value of msg.sender for the caller of the action. Will either
     *               be same as user, the calling router, or the off-chain relayer.
     * @param base The base-side token in the pair.
     * @param quote The quote-side token in the pair.
     * @param poolIdx The Croc-specific pool type index the pool is being created on.
     *
     * @returns       Returns true if action is permitted. If false, CrocSwap will revert
     *                the transaction, and pool will not be initialized. */
    function checkApprovedForCrocInit (address user, address sender,
                                       address base, address quote, uint256 poolIdx)
        external returns (bool);

    /* @notice Just used to validate the contract address at pool creation time. */
    function acceptsPermitOracle() external returns (bool);
}
