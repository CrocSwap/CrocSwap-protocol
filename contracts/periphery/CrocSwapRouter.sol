// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import "../CrocSwapDex.sol";

/* @notice External router contract designed to provide ergonomic call interface to swap options
 *         without requiring CrocSwapDex approval. Relies on bilateral token transfers instead of
 *         user approved relayer calls. Flip side is the user will need to approve any tokens sold
 *         by this contract. */
contract CrocSwapRouter {

    address lockHolder_;
    address immutable dex_;
    mapping(address => uint256) approvals_;

    /* @param dex The address of the CrocSwapDex contract to route swaps through. */ 
    constructor (address dex) {
        dex_ = dex;
    }

    receive() payable external { 
        require(lockHolder_ != address(0), "Does not receive Ether outside lock");
        TransferHelper.safeEtherSend(lockHolder_, msg.value);
    }

    /* @notice ABI compatible with CrocSwapDex::swap() call but uses the swap proxy userCmd() call.
     *         Useful when hot path is closed. */
    function swap (address base, address quote,
                   uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty, uint16 tip,
                   uint128 limitPrice, uint128 minOut,
                   uint8 reserveFlags) public payable reEntrackLock
        returns (int128 baseFlow, int128 quoteFlow) {
        require(reserveFlags == 0, "Router does not support surplus collateral");

        preLoadTokens(base, quote, isBuy, inBaseQty, qty, minOut);
        (baseFlow, quoteFlow) = execSwap(base, quote, poolIdx, isBuy, inBaseQty, 
            qty, tip, limitPrice, minOut);
        settleTokens(base, quote);
    }

    /* @notice Preemptively loads the max potential sell tokens the swap will need.
     * 
     * @dev Note that this loads the worst-case quantity of sell tokens, in case of floating
     *      sell side. So will have to refund any unspent at settlement. */
    function preLoadTokens (address base, address quote, bool isBuy, bool inBaseQty, 
        uint128 qty, uint128 minOut) private {

        bool baseSendToken = isBuy && base != address(0);
        bool quoteSendToken = !isBuy;
        uint256 qtySend = isBuy == inBaseQty ? qty : minOut;

        if (baseSendToken) {
            prepSellToken(base, qtySend);
        } else if (quoteSendToken) {
            prepSellToken(quote, qtySend);
        }
    }

    function prepSellToken (address token, uint256 qty) private {
        // Approve each token from router->dex once ever the first time it's used. Saves on unnecessary
        // aproval calls. Since dex caps at uint128 spend, setting to uint256 means the approval will
        // never run out.
        if (approvals_[token] == 0) {
            IERC20Minimal(token).approve(dex_, type(uint256).max);
            approvals_[token] = 1;
        }
        TransferHelper.safeTransferFrom(token, msg.sender, address(this), qty);
    }

    /* @notice Makes the userCmd() swap proxy call.
     * @dev This will make the swap call using the router contract's token balances. Therefore
     *      the call needs to make sure to transfer tokens to/from the end user and this contract */
    function execSwap (address base, address quote,
                       uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty, uint16 tip,
                       uint128 limitPrice, uint128 minOut) 
        private returns (int128 baseFlow, int128 quoteFlow) {

        bytes memory swapCall = abi.encode(base, quote, poolIdx, isBuy, inBaseQty, 
            qty, tip, limitPrice, minOut, 0x0);
        bytes memory result = CrocSwapDex(payable(dex_)).userCmd
            {value: msg.value}(CrocSlots.SWAP_PROXY_IDX, swapCall);

        (baseFlow, quoteFlow) = abi.decode(result, (int128, int128));

    }

    /* @notice Returns any plausible tokens held by the router contract, post-swap, back to the
     *         caller.
     *
     * @dev The router contract is designed to never hold any value outside a transaction. So we
     *      safely assume that any token/ether balance remaining in the router belongs to the user. */
    function settleTokens (address base, address quote) private {
        // If buy-side is floating we have to refund both the buy and sell side
        sendTokenBalance(base);
        sendTokenBalance(quote);
    }

    /* @notice Transfers any remaining token balance held by the router back to the caller. */
    function sendTokenBalance (address token) private {
        if (token != address(0)) {
            uint256 balance = IERC20Minimal(token).balanceOf(address(this));
            if (balance > 0) {
                TransferHelper.safeTransfer(token, msg.sender, balance);
            }
        }
    }

    modifier reEntrackLock() {
        require(lockHolder_ == address(0), "Re-entrant call");
        lockHolder_ = msg.sender;
        _;
        lockHolder_ = address(0);
    }
}

/* @notice External router contract designed to provide ergonomic call interface to swap options
 *         by using CrocSwapDex approval for direct transfer of tokens to/from dex and end user. */
contract CrocSwapRouterBypass {
    address immutable dex_;

    /* @param dex The address of the CrocSwapDex contract to route swaps through. */ 
    constructor (address dex) {
        dex_ = dex;
    }

    /* @notice ABI compatible with CrocSwapDex::swap() call but uses the swap proxy userCmdRouter()
     *         call. Useful when hot path is closed.
     * 
     * @dev Note that user will have to approve() this contract in CrocSwapDex. */
    function swap (address base, address quote,
                   uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty, uint16 tip,
                   uint128 limitPrice, uint128 minOut,
                   uint8 reserveFlags) public payable
        returns (int128 baseFlow, int128 quoteFlow) {
        bytes memory swapCall = abi.encode(base, quote, poolIdx, isBuy, inBaseQty, 
            qty, tip, limitPrice, minOut, reserveFlags);
        bytes memory result = CrocSwapDex(payable(dex_)).userCmdRouter
            {value: msg.value}(CrocSlots.SWAP_PROXY_IDX, swapCall, msg.sender);

        (baseFlow, quoteFlow) = abi.decode(result, (int128, int128));
    }
}