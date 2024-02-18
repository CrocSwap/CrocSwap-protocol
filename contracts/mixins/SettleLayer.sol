// SPDX-License-Identifier: GPL-3                                                          
pragma solidity 0.8.19;
pragma experimental ABIEncoderV2;

import '../libraries/Directives.sol';
import '../libraries/TransferHelper.sol';
import '../libraries/TokenFlow.sol';
import './StorageLayout.sol';
import './AgentMask.sol';

/* @title Settle layer mixin
 * @notice Provides facilities for settling, previously determined, collateral flows
 *         between the user and the exchange. Supports both ERC20 tokens as well as
 *         native Ethereum as asset collateral. */
contract SettleLayer is AgentMask {
    using SafeCast for uint256;
    using SafeCast for uint128;
    using TokenFlow for address;

    address public wbera;

    constructor(address initialWbera) {
        wbera = initialWbera;
    }

    /* @notice Completes the user<->exchange collateral settlement at the final hop
     *         in the transaction. Settles both the token from the last leg in the chain
     *         as well as closes out the previous net Ether flows.
     * 
     * @dev    This method settles any net Ether debits or credits in the ethFlows
     *         argument, by consuming the native ETH attached in msg.value, using
     *         popMsgVal(). popMsgVal() sets a transaction level flag, and to prevent
     *         double spent will revert and fail the top level CrocSwapDex contract
     *         call if ever called twice in the same transction. Therefore this method
     *         must only be called at most once per transaction, otherwise the top-level
     *         CrocSwapDex contract call will revert and fail.  
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
     * @dev   This call is the point where any Ether debit 
     Because this actually collects any Ether debit (using msg.value), this
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
     * @param reserveFlags Bitwise flags to indicate whether the base and/or quote flows
     *                     should be settled from caller's surplus collateral */
    function settleFlows (address base, address quote, int128 baseFlow, int128 quoteFlow,
                          uint8 reserveFlags) internal {
        (address debitor, address creditor) = agentsSettle();
        settleFlat(debitor, creditor, base, baseFlow, quote, quoteFlow, reserveFlags);
    }

    /* @notice Settle the collateral exchange associated with a the initailization of
     *         a new pool in the exchange.
     * @oaran recv The address that will be covering any debits associated with the
     *             initialization of the pool.
     * @param base The ERC20 address of the base token collateral in the pair (if 0x0 
     *             indicates that the collateral is native Eth).
     * @param baseFlow The amount of flow associated with the base side of the pair. 
     *                 By convention negative for credits paid to user, positive for debits,
     *                 but will always be positive/debit for this operation.
     * @param quote The ERC20 address of the quote token collateral in the pair.
     * @param quoteFlow The flow associated with the quote side of the pair. */
    function settleInitFlow (address recv,
                             address base, int128 baseFlow,
                             address quote, int128 quoteFlow) internal {
        (uint256 baseSnap, uint256 quoteSnap) = snapOpenBalance(base, quote);
        settleFlat(recv, recv, base, baseFlow, quote, quoteFlow, BOTH_RESERVE_FLAGS);
        assertCloseMatches(base, baseSnap, baseFlow);
        assertCloseMatches(quote, quoteSnap, quoteFlow);
    }

    // We always pass in wbera as the base token here.
    function settleInitFlowBera (address recv,
                             address base, int128 baseFlow,
                             address quote, int128 quoteFlow) internal {
        (uint256 baseSnap, uint256 quoteSnap) = snapOpenBalance(base, quote);
        wrapBeraAndDeposit(uint128(baseFlow));
        transactToken(recv, recv, quoteFlow, quote, false);
        assertCloseMatches(base, baseSnap, baseFlow);
        assertCloseMatches(quote, quoteSnap, quoteFlow);
    }

    /* @notice Settles the collateral exchanged associated with the flow in a single 
     *         pair.
     * @dev    This must only be used when no other pairs settle in the transaction. */
    function settleFlat (address debitor, address creditor,
                         address base, int128 baseFlow,
                         address quote, int128 quoteFlow, uint8 reserveFlags) private {
        if (nativeInReserveUseBase(reserveFlags)) {
            if (base == wbera) {
                wrapBeraAndDeposit(uint128(-baseFlow));
                transactToken(debitor, creditor, quoteFlow, quote, false);
            } else {
                wrapBeraAndDeposit(uint128(-quoteFlow));
                transactToken(debitor, creditor, baseFlow, base, true);
            }
            return;
        }

        if (nativeInReserveUseQuote(reserveFlags)) {
            if (base == wbera) {
                wrapBeraAndDeposit(uint128(-baseFlow));
                transactToken(debitor, creditor, quoteFlow, quote, true);
            } else {
                wrapBeraAndDeposit(uint128(-quoteFlow));
                transactToken(debitor, creditor, baseFlow, base, false);
            }
            return;
        }

        if (nativeOutReserveFlagBase(reserveFlags)) {
            if (base == wbera) {
                unwrapWberaAndSend(creditor, uint128(-baseFlow));
                transactToken(debitor, creditor, quoteFlow, quote, false);
            } else {
                unwrapWberaAndSend(creditor, uint128(-quoteFlow));
                transactToken(debitor, creditor, baseFlow, base, true);
            }
            return;
        }

        if (nativeOutReserveFlagQuote(reserveFlags)) {
            if (base == wbera) {
                unwrapWberaAndSend(creditor, uint128(-baseFlow));
                transactToken(debitor, creditor, quoteFlow, quote, true);
            } else {
                unwrapWberaAndSend(creditor, uint128(-quoteFlow));
                transactToken(debitor, creditor, baseFlow, base, false);
            }
            return;
        }

        if (base.isEtherNative()) {
            transactEther(debitor, creditor, baseFlow, useReservesBase(reserveFlags));
        } else {
            transactToken(debitor, creditor, baseFlow, base,
                          useReservesBase(reserveFlags));
        }

        // Because Ether native trapdoor is 0x0 address, and because base is always
        // smaller of the two addresses, native ETH will always appear on the base
        // side.
        transactToken(debitor, creditor, quoteFlow, quote,
                      useReservesQuote(reserveFlags));
    }

    function useReservesBase (uint8 reserveFlags) private pure returns (bool) {
        return reserveFlags & BASE_RESERVE_FLAG > 0;
    }
    
    function useReservesQuote (uint8 reserveFlags) private pure returns (bool) {
        return reserveFlags & QUOTE_RESERVE_FLAG > 0;
    }

    function nativeInReserveUseBase (uint8 reserveFlags) private pure returns (bool) {
        return reserveFlags ^ RESERVE_FLAG_NATIVE_IN_BASE == 0;
    }

    function nativeInReserveUseQuote (uint8 reserveFlags) private pure returns (bool) {
        return reserveFlags ^ RESERVE_FLAG_NATIVE_IN_QUOTE == 0;
    }

    function nativeOutReserveFlagBase (uint8 reserveFlags) private pure returns (bool) {
        return reserveFlags ^ RESERVE_FLAG_NATIVE_OUT_BASE == 0;
    }

    function nativeOutReserveFlagQuote (uint8 reserveFlags) private pure returns (bool) {
        return reserveFlags ^ RESERVE_FLAG_NATIVE_OUT_QUOTE == 0;
    }

    uint8 constant NO_RESERVE_FLAGS = 0x0;
    uint8 constant BASE_RESERVE_FLAG = 0x1;
    uint8 constant QUOTE_RESERVE_FLAG = 0x2;    
    uint8 constant BOTH_RESERVE_FLAGS = 0x3;
    uint8 constant RESERVE_FLAG_NATIVE_IN_BASE = 0x4;
    uint8 constant RESERVE_FLAG_NATIVE_IN_QUOTE = 0x5;
    uint8 constant RESERVE_FLAG_NATIVE_OUT_BASE = 0x6;
    uint8 constant RESERVE_FLAG_NATIVE_OUT_QUOTE = 0x7;

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

    function querySurplus (address user, address token) internal view returns (uint128) {
        bytes32 key = tokenKey(user, token);
        return userBals_[key].surplusCollateral_;
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
        uint128 recvEth = popMsgVal();
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
                             uint128 bookedEth) internal {
        if (token.isEtherNative()) {
            payEther(recv, value, bookedEth);
        } else {
            TransferHelper.safeTransfer(token, recv, value);
        }
    }

    /* @notice Settles a debit with an external transfer from user. */
    function debitTransfer (address recv, uint128 value, address token,
                            uint128 bookedEth) internal {
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
        bytes32 key = tokenKey(recv, token);
        userBals_[key].surplusCollateral_ += value;
    }

    /* @notice Debits the tokens owed from the user's pre-existing surplus collateral
     *         balance at the exchange.
     * @return remainder The amount of the debit that cannot be satisfied by surplus
     *                   collateral alone (0 othersize). */
    function debitSurplus (address recv, uint128 value, address token) private
        returns (uint128 remainder) {
        bytes32 key = tokenKey(recv, token);
        UserBalance storage bal = userBals_[key];
        uint128 balance = bal.surplusCollateral_;
        
        if (balance > value) {
            bal.surplusCollateral_ -= value;
        } else {
            bal.surplusCollateral_ = 0;
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

    function unwrapWberaAndSend (address recv, uint128 value) internal {
        wbera.call(abi.encodeWithSignature("withdraw(uint256)", uint256(value)));
        TransferHelper.safeTransfer(wbera, recv, value);
    }

    function wrapBeraAndDeposit (uint128 value) internal {
        uint128 msgValue = popMsgVal();
        require(msgValue >= value, "TF4");
        wbera.call{value: uint256(msgValue)}(abi.encodeWithSignature("deposit()"));
    }
}
