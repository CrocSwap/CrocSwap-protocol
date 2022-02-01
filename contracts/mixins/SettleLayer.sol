// SPDX-License-Identifier: Unlicensed                                                          
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import '../libraries/Directives.sol';
import '../libraries/TransferHelper.sol';
import '../libraries/TokenFlow.sol';
import './StorageLayout.sol';
import './AgentMask.sol';

import "hardhat/console.sol";

/* @title Settle layer mixin
 * @notice Provides facilities for settling, previously determined, collateral flows
 *         between the user and the exchange. Supports both ERC20 tokens as well as
 *         native Ethereum as asset collateral. */
contract SettleLayer is AgentMask {
    using SafeCast for uint256;
    using SafeCast for uint128;
    using TokenFlow for address;

    /* @notice Completes the user<->exchange collateral settlement at the final hop
     *         in the transaction. Settles both the token from the last leg in the chain
     *         as well as closes out the previous net Ether flows.
     * 
     * @dev    Because this actually collects any Ether debit (using msg.value), this
     *         function must be called *exactly once* as the final settlement call in
     *         a transaction. Otherwise, a double-spend is possible.
     *
     * @param flow The net flow for this settlement leg. Negative for credits paid to
     *             user, positive for debits.
     * @param dir The directive governing the details of how the user once the leg 
     *            settled.
     * @param ethFlows Any prior Ether-specific flows from previous legs. (This final
     *            leg may also be denominated in Eth, and this param should *not* include
     *            the current leg's value.) */
    function settleFinal (int128 flow, Directives.SettlementChannel memory dir,
                          int128 ethFlows) internal {
        (address debitor, address creditor) = agentsSettle();
        settleFinal(debitor, creditor, flow, dir, ethFlows);
    }

    /* @notice Completes the user<->exchange collateral settlement on an intermediate hop
     *         leg in the transaction. For ERC20 tokens the flow will be settled at this
     *         call. For native Ether flows, the net flow will be returned to be deferred
     *         until the settleFinal() call. This is because we potentially have multiple
     *         native Eth settlement legs and want to avoid a msg.value double spend.
     *
     * @param flow The net flow for this settlement leg. Negative for credits paid to
     *             user, positive for debits.
     * @param dir The directive governing the details of how the user once the leg 
     *            settled.
     * @return ethFlows Any native Eth flows associated with this leg. It's the caller's
     *                  responsibility to accumulate and sum this value for all calls,
     *                  then pass to settleFinal() at the end of the transaction. */
    function settleLeg (int128 flow, Directives.SettlementChannel memory dir)
        internal returns (int128 ethFlows) {
        (address debitor, address creditor) = agentsSettle();
        return settleLeg(debitor, creditor, flow, dir);
    }

    /* @notice Completes the user<->exchange collateral settlement at the final hop
     *         in the transaction. Settles both the token from the last leg in the chain
     *         as well as closes out the previous net Ether flows.
     * 
     * @dev    Because this actually collects any Ether debit (using msg.value), this
     *         function must be called *exactly once* as the final settlement call in
     *         a transaction. Otherwise, a double-spend is possible.
     *
     * @param debitor The address from which any debts to the exchange should be 
     *                collected.
     * @param creditor The address to which any credits owed to the user should be paid.
     * @param flow The net flow for this settlement leg. Negative for credits paid to
     *             user, positive for debits.
     * @param dir The directive governing the details of how the user once the leg 
     *            settled.
     * @param ethFlows Any prior Ether-specific flows from previous legs. (This final
     *            leg may also be denominated in Eth, and this param should *not* include
     *            the current leg's value.) */
    function settleFinal (address debitor, address creditor, int128 flow,
                          Directives.SettlementChannel memory dir,
                          int128 ethFlows) internal {
        ethFlows += settleLeg(debitor, creditor, flow, dir);
        transactEther(debitor, creditor, ethFlows, dir.useSurplus_);
    }

    /* @notice Completes the user<->exchange collateral settlement on an intermediate hop
     *         leg in the transaction. For ERC20 tokens the flow will be settled at this
     *         call. For native Ether flows, the net flow will be returned to be deferred
     *         until the settleFinal() call. This is because we potentially have multiple
     *         native Eth settlement legs and want to avoid a msg.value double spend.
     *
     * @param debitor The address from which any debts to the exchange should be 
     *                collected.
     * @param creditor The address to which any credits owed to the user should be paid.
     * @param flow The net flow for this settlement leg. Negative for credits paid to
     *             user, positive for debits.
     * @param dir The directive governing the details of how the user once the leg 
     *            settled.
     * @return ethFlows Any native Eth flows associated with this leg. It's the caller's
     *                  responsibility to accumulate and sum this value for all calls,
     *                  then pass to settleFinal() at the end of the transaction. */
    function settleLeg (address debitor, address creditor, int128 flow,
                        Directives.SettlementChannel memory dir)
        internal returns (int128 ethFlows) {
        require(passesLimit(flow, dir.limitQty_), "K");
        if (moreThanDust(flow, dir.dustThresh_)) {
            ethFlows = pumpFlow(debitor, creditor, flow, dir.token_, dir.useSurplus_);
        }
    }

    /* @notice Settle the collateral exchange associated with a single bilateral pair.
     *         Useful and gas efficient when there's only one pair in the transaction.
     * @param base The ERC20 address of the base token collateral in the pair (if 0x0 
     *             indicates that the collateral is native Eth).
     * @param quote The ERC20 address of the quote token collateral in the pair.
     * @param baseFlow The amount of flow associated with the base side of the pair. 
     *                 Negative for credits paid to user, positive for debits.
     * @param quoteFlow The flow associated with the quote side of the pair.
     * @param useSurplus If true, first try to settle using the user's exchange-held
     *                   surplus collateral account, rather than external transfer. */
    function settleFlows (address base, address quote, int128 baseFlow, int128 quoteFlow,
                          bool useSurplus) internal {
        (address debitor, address creditor) = agentsSettle();
        settleFlat(debitor, creditor, base, baseFlow, quote, quoteFlow, useSurplus);
    }

    /* @notice Settle the collateral exchange associated with a the initailization of
     *         a new pool in the exchange.
     * @oaran recv The address that will be covering any debits associated with the
     *             initialization of the pool.
     * @param base The ERC20 address of the base token collateral in the pair (if 0x0 
     *             indicates that the collateral is native Eth).
     * @param baseFlow The amount of flow associated with the base side of the pair. 
     *                 Negative for credits paid to user, positive for debits.
     * @param quote The ERC20 address of the quote token collateral in the pair.
     * @param quoteFlow The flow associated with the quote side of the pair. */
    function settleInitFlow (address recv,
                             address base, int128 baseFlow,
                             address quote, int128 quoteFlow) internal {
        (uint256 baseSnap, uint256 quoteSnap) = snapOpenBalance(base, quote);
        settleFlat(recv, recv, base, baseFlow, quote, quoteFlow, false);
        console.log("A");
        assertCloseMatches(base, baseSnap, baseFlow);
        assertCloseMatches(quote, quoteSnap, quoteFlow);
    }

    /* @notice Settles the collateral exchanged associated with the flow in a single 
     *         pair.
     * @dev    This must only be used when no other pairs settle in the transaction. */
    function settleFlat (address debitor, address creditor,
                         address base, int128 baseFlow,
                         address quote, int128 quoteFlow, bool useReserves) private {
        if (base.isEtherNative()) {
            transactEther(debitor, creditor, baseFlow, useReserves);
        } else {
            transactToken(debitor, creditor, baseFlow, base, useReserves);
        }

        // Because Ether native trapdoor is 0x0 address, and because base is always
        // smaller of the two addresses, native ETH will always appear on the base
        // side.
        transactToken(debitor, creditor, quoteFlow, quote, useReserves);
    }

    /* @notice Performs check to make sure the new balance matches the expected 
     * transfer amount. */
    function assertCloseMatches (address token, uint256 open, int128 expected)
        private view {
        if (token != address(0)) {            
            uint256 close = IERC20Minimal(token).balanceOf(address(this));
            require(close >= open && expected >= 0 &&
                    close - open >= uint128(expected), "TD");
        }
    }

    /* @notice Snapshots the DEX contract's ERC20 token balance at call time. */
    function snapOpenBalance (address base, address quote) private view returns
        (uint256 openBase, uint256 openQuote) {
        openBase = base == address(0) ? 0 :
            IERC20Minimal(base).balanceOf(address(this));
        openQuote = IERC20Minimal(quote).balanceOf(address(this));
    }

    /* @notice Given a pre-determined amount of flow, settles according to collateral 
     *         type and settlement specification. */
    function pumpFlow (address debitor, address creditor, int128 flow,
                       address token, bool useReserves)
        private returns (int128) {
        if (token.isEtherNative()) {
            return flow;
        } else {
            transactToken(debitor, creditor, flow, token, useReserves);
            return 0;
        }
    }

    /* @notice Returns the user's surplus collateral balance at the exchange.
     * @param user The address corresponding to the user holding the surplus collateral.
     * @param token The address for the token, whose balance we're checking 
     *              (0x0 for native Ether). */
    function querySurplus (address user, address token) internal view returns (uint128) {
        bytes32 key = encodeSurplusKey(user, token);
        return surplusCollateral_[key];
    }

    /* @notice Directly deposits a certain amount of surplus collateral to a user's
     *         account.
     *
     * @dev    This call can be used both for token and native Ether collateral. For the
     *         lateral the user must set msg.value with the corresponding amount. Because
     *         it deals with msg.value, this function must *never* be called twice in the
     *         same transaction, to avoid the risk of double-spend.
     *
     * @param owner The address of the owner associated with the account.
     * @param value The amount to be collected from owner and deposited.
     * @param token The ERC20 address of the token (or native Ether if set to 0x0) being
     *              deposited. */
    function depositSurplus (address owner, uint128 value, address token) internal {
        debitTransfer(owner, value, token, msg.value.toUint128());
        bytes32 key = encodeSurplusKey(owner, token);
        surplusCollateral_[key] += value;
    }

    /* @notice Pays out surplus collateral held by the owner at the exchange.
     *
     * @dev There is no security check associated with this call. It's the caller's 
     *      responsibility of the caller to make sure the receiver is authorized to
     *      to collect the owner's balance.
     *
     * @param owner The address of the owner associated with the account.
     * @param recv  The receiver where the collateral will be sent to.
     * @param value The amount to be paid out. Owner's balance will be decremented 
     *              accordingly.
     * @param token The ERC20 address of the token (or native Ether if set to 0x0) being
     *              disbursed. */
    function disburseSurplus (address owner, address recv,
                              uint128 value, address token) internal {
        bytes32 key = encodeSurplusKey(owner, token);
        uint128 balance = surplusCollateral_[key];

        if (value == 0) { value = balance; }
        require(balance > 0 && value <= balance, "SC");

        // No need to use msg.value, because unlike trading there's no logical reason
        // we'd expect it to be set on this call.
        creditTransfer(recv, value, token, 0);
        surplusCollateral_[key] -= value;
    }

    function moveSurplus (address from, address to, uint128 value, address token)
        internal {
        bytes32 fromKey = encodeSurplusKey(from, token);
        bytes32 toKey = encodeSurplusKey(to, token);
        uint128 balance = surplusCollateral_[fromKey];

        if (value == 0) { value = balance; }
        require(balance > 0 && value <= balance, "SC");

        surplusCollateral_[fromKey] -= value;
        surplusCollateral_[toKey] += value;
    }

    /* @notice Returns true if the flow represents a debit owed from the user to the
     *         exchange. */
    function isDebit (int128 flow) private pure returns (bool) {
        return flow > 0;
    }
    
    /* @notice Returns true if the flow represents a credit owed from the exchange to the
     *         user. */
    function isCredit (int128 flow) private pure returns (bool) {
        return flow < 0;
    }

    /* @notice Called to settle a net balance of native Ether.
     * @dev Becaue this settles against msg.value, it's very important to *never* call
     *      this twice in any single transaction, to avoid double-spend.
     *
     * @param debitor The address to collect any net debit from.
     * @param creditor The address to pay out any net credit to.
     * @param flow The total net balance to be settled. Negative indicates credit to the
     *             user. Positive debit to the exchange.
     * @para useReserves If true, any settlement is first done against the user's surplus
     *                   collateral account at the exchange rather than sending Ether. */
    function transactEther (address debitor, address creditor,
                            int128 flow, bool useReserves)
        private {
        // This is the only point in a standard transaction where msg.value is accessed.
        uint128 recvEth = msg.value.toUint128();
        if (flow != 0) {
            transactFlow(debitor, creditor, flow, address(0), recvEth, useReserves);
        } else {
            refundEther(creditor, recvEth);
        }
    }

    /* @notice Called to settle a net balance of ERC20 tokens
     * @dev transactEther Unlike transactEther this can be called multiple times, even
     *      on the same token.
     *
     * @param debitor The address to collect any net debit from.
     * @param creditor The address to pay out any net credit to.
     * @param flow The total net balance to be settled. Negative indicates credit to the
     *             user. Positive debit to the exchange.
     * @param token The address of the token's ERC20 tracker.
     * @para useReserves If true, any settlement is first done against the user's surplus
     *                   collateral account at the exchange. */
    function transactToken (address debitor, address creditor, int128 flow,
                           address token, bool useReserves) private {
        require(!token.isEtherNative());
        // Since this is a token settlement, we defer booking any native ETH in msg.value
        uint128 bookedEth = 0;
        transactFlow(debitor, creditor, flow, token, bookedEth, useReserves);
    }

    /* @notice Handles the single sided settlement of a token or native ETH flow. */
    function transactFlow (address debitor, address creditor,
                           int128 flow, address token,
                           uint128 bookedEth, bool useReserves) private {
        if (isDebit(flow)) {
            debitUser(debitor, uint128(flow), token, bookedEth, useReserves);
        } else if (isCredit(flow)) {
            creditUser(creditor, uint128(-flow), token, bookedEth, useReserves);
        }           
    }

    /* @notice Collects a collateral debit from the user depending on the asset type
     *         and the settlement specifcation. */
    function debitUser (address recv, uint128 value, address token,
                        uint128 bookedEth, bool useReserves) private {
        if (useReserves) {
            uint128 remainder = debitSurplus(recv, value, token);
            debitRemainder(recv, remainder, token, bookedEth);
        } else {
            debitTransfer(recv, value, token, bookedEth);
        }
    }

    /* @notice Collects the remaining debit (if any) after the user's surplus collateral
     *         balance has been exhausted. */
    function debitRemainder (address recv, uint128 remainder, address token,
                             uint128 bookedEth) private {
        if (remainder > 0) {
            debitTransfer(recv, remainder, token, bookedEth);
        } else if (token.isEtherNative()) {
            refundEther(recv, bookedEth);
        }
    }

    /* @notice Pays out a collateral credit to the user depending on asset type and 
     *         settlement specification. */
    function creditUser (address recv, uint128 value, address token,
                         uint128 bookedEth, bool useReserves) private {
        if (useReserves) {
            creditSurplus(recv, value, token);
            creditRemainder(recv, token, bookedEth);
        } else {
            creditTransfer(recv, value, token, bookedEth);
        }
    }

    /* @notice Handles any refund necessary after a credit has been paid to the user's 
     *         surplus collateral balance. */
    function creditRemainder (address recv, address token, uint128 bookedEth) private {
        if (token.isEtherNative()) {
            refundEther(recv, bookedEth);
        }
    }

    /* @notice Settles a credit with an external transfer to user. */
    function creditTransfer (address recv, uint128 value, address token,
                             uint128 bookedEth) private {
        if (token.isEtherNative()) {
            payEther(recv, value, bookedEth);
        } else {
            TransferHelper.safeTransfer(token, recv, value);
        }
    }

    /* @notice Settles a debit with an external transfer from user. */
    function debitTransfer (address recv, uint128 value, address token,
                            uint128 bookedEth) private {
        if (token.isEtherNative()) {
            collectEther(recv, value, bookedEth);
        } else {
            collectToken(recv, value, token);
        }
    }

    /* @notice Pays a native Ethereum credit to the user (and refunds any overpay in
     *         the transction, since by definition they have no debit.) */
    function payEther (address recv, uint128 value, uint128 overpay) private {
        TransferHelper.safeEtherSend(recv, value + overpay);
    }

    /* @notice Collects a debt in the form of native Ether. Since the only way to pay
     *         Ether is as msg.value, this function checks that's sufficient to cover
     *         the debt and pays the difference as a refund.
     * @dev Because of the risk of double-spend, this must *never* be called more than
     *      once in a transaction.
     * @param recv The address to send any over-payment refunds to.
     * @param value The amount of Ether owed to the exchange. msg.value must exceed
     *              this threshold.
     * @param paidEth The amount of Ether paid by the user in this transaction (usually
     *                msg.value) */
    function collectEther (address recv, uint128 value, uint128 paidEth) private {
        require(paidEth >= value, "EC");
        uint128 overpay = paidEth - value;
        refundEther(recv, overpay);
    }

    /* @notice Refunds any overpaid native Eth (if any) */
    function refundEther (address recv, uint128 overpay) private {
        if (overpay > 0) {
            TransferHelper.safeEtherSend(recv, overpay);
        }
    }

    /* @notice Collects a token debt from a specfic debtor.
     * @dev    Note that this function does *not* assert that the post-transfer balance
     *         is correct. CrocSwap is not safe to use for any fee-on-transfer tokens
     *         or any other tokens that break ERC20 transfer functionality.
     *
     * @param recv The address of the debtor being collected from.
     * @param value The total amount of tokens being collected.
     * @param token The address of the ERC20 token tracker. */
    function collectToken (address recv, uint128 value, address token) private {
        TransferHelper.safeTransferFrom(token, recv, address(this), value);
    }

    /* @notice Credits a user's surplus collateral account at the exchange (instead of
     *         directly sending the tokens to their address) */
    function creditSurplus (address recv, uint128 value, address token) private {
        bytes32 key = encodeSurplusKey(recv, token);
        surplusCollateral_[key] += value;
    }

    /* @notice Debits the tokens owed from the user's pre-existing surplus collateral
     *         balance at the exchange.
     * @return remainder The amount of the debit that cannot be satisfied by surplus
     *                   collateral alone (0 othersize). */
    function debitSurplus (address recv, uint128 value, address token) private
        returns (uint128 remainder) {
        bytes32 key = encodeSurplusKey(recv, token);
        uint128 balance = surplusCollateral_[key];

        if (balance > value) {
            surplusCollateral_[key] -= value;
        } else {
            surplusCollateral_[key] = 0;
            remainder = value - balance;
        }
    }

    /* @notice Returns true if the net settled flow is equal or better to the user's
     *         minimum expected amount. (Otherwise upstream should revert the tx.) */     
    function passesLimit (int128 flow, int128 limitQty)
        private pure returns (bool) {
        return flow <= limitQty;
    }

    /* @notice If true, determines that the settlement flow should be ignored because
     *         it's economically meaningless and not worth transacting. */
    function moreThanDust (int128 flow, uint128 dustThresh)
        private pure returns (bool) {
        if (isDebit(flow)) {
            return true;
        } else {
            return uint128(-flow) > dustThresh;
        }
    }

    /* @notice Returns the keccak256 hash associated with the surplus collateral 
     *         position for a given user on a given token. */
    function encodeSurplusKey (address owner, address token) internal
        pure returns (bytes32) {
        return keccak256(abi.encode(owner, token));
    }
}

