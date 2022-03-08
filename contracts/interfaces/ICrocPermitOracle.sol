// SPDX-License-Identifier: Unlicensed 

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';

/* @notice Standard interface for a permit oracle to be used by a permissioned pool. */
interface ICrocSwapPermitOracle {

    /* @notice Verifies whether a given user is permissioned to perform an arbitrary 
     *          action on the pool.
     *
     * @param user The address of the caller to the contract.
     * @param base The base-side token in the pair.
     * @param quote The quote-side token in the pair.
     * @param ambient The ambient liquidity directive for the pool action (possibly zero)
     * @param swap    The swap directive for the pool (possibly zero)
     * @param concs   The concentrated liquidity directives for the pool (possibly empty)
     *
     * @returns       Returns true if action is permitted. If false, CrocSwap will revert
     *                the transaction. */
    function checkApprovedForCrocPool (address user, address sender,
                                       address base, address quote,
                                       Directives.AmbientDirective calldata ambient,
                                       Directives.SwapDirective calldata swap,
                                       Directives.ConcentratedDirective[] calldata concs,
                                       uint24 poolFee)
        external returns (uint24);

    /* @notice Verifies whether a given user is permissioned to perform a swap on the pool
     *
     * @param user The address of the caller to the contract.
     * @param base The base-side token in the pair.
     * @param quote The quote-side token in the pair.
     * @param isBuy  If true, the swapper is paying base and receiving quote
     * @param inBaseQty  If true, the qty is denominated in the base token side.
     * @param qty        The full qty on the swap request (could possibly be lower if user
     *                   hits limit price.
     *
     * @returns       Returns true if action is permitted. If false, CrocSwap will revert
     *                the transaction. */
    function checkApprovedForCrocSwap (address user, address sender,
                                       address base, address quote,
                                       bool isBuy, bool inBaseQty, uint128 qty,
                                       uint24 poolFee)
        external returns (uint24);

    /* @notice Verifies whether a given user is permissioned to mint liquidity
     *         on the pool.
     *
     * @param user The address of the caller to the contract.
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
}
