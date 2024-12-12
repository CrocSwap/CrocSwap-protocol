// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './libraries/PriceGrid.sol';
import './mixins/MarketSequencer.sol';
import './mixins/SettleLayer.sol';
import './mixins/PoolRegistry.sol';

import './interfaces/ICrocMinion.sol';
import './callpaths/ColdPath.sol';
import './callpaths/BootPath.sol';
import './callpaths/WarmPath.sol';
import './callpaths/HotPath.sol';
import './callpaths/LongPath.sol';
import './callpaths/KnockoutPath.sol';
import './callpaths/MicroPaths.sol';
import './callpaths/SafeModePath.sol';

/* @title CrocSwap exchange contract
 * @notice Top-level CrocSwap contract. Contains all public facing methods and state
 *         for the entire dex across every pool.
 *
 * @dev    Sidecar proxy contracts exist to contain code that doesn't fit in the Ethereum
 *         limit, but this is the only contract that users need to directly interface 
 *         with. */
contract CrocSwapDex is HotPath, ICrocMinion {

    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;

    constructor() {
        // Authority is originally set to deployer address, which can then transfer to
        // proper governance contract (if deployer already isn't)
        authority_ = msg.sender;
        hotPathOpen_ = true;
        proxyPaths_[CrocSlots.BOOT_PROXY_IDX] = address(new BootPath());
    }

    /* @notice Swaps between two tokens within a single liquidity pool.
     *
     * @dev This is the most gas optimized swap call, since it avoids calling out to any
     *      proxy contract. However there's a possibility in the future that this call 
     *      path could be disabled to support upgraded logic. In which case the caller 
     *      should be able to swap through using a userCmd() call on the HOT_PATH proxy
     *      call path.
     * 
     * @param base The base-side token of the pair. (For native Ethereum use 0x0)
     * @param quote The quote-side token of the pair.
     * @param poolIdx The index of the pool type to execute on.
     * @param isBuy If true the direction of the swap is for the user to send base tokens
     *              and receive back quote tokens.
     * @param inBaseQty If true the quantity is denominated in base-side tokens. If not
     *                  use quote-side tokens.
     * @param qty The quantity of tokens to swap. End result could be less if the pool 
     *            price reaches limitPrice before exhausting.
     * @param tip A user-designated liquidity fee paid to the LPs in the pool. If set to
     *            0, just defaults to the standard pool rate. Otherwise represents the
     *            proposed LP fee in units of 1/1,000,000. Not used in standard swap 
     *            calls, but may be used in certain permissioned or dynamic fee pools.
     * @param limitPrice The worse price the user is willing to pay on the margin. Swap
     *                   will execute up to this price, but not any worse. Average fill 
     *                   price will always be equal or better, because this is calculated
     *                   at the marginal unit of quantity.
     * @param minOut The minimum output the user expects from the swap. If less is 
     *               returned, the transaction will revert. (Alternatively if the swap
     *               is fixed in terms of output, this is the maximum input.)
     * @param reserveFlags Bitwise flags to indicate if the user wants to pay/receive in
     *                     terms of surplus collateral balance held at the dex contract.
     *                          0x1 - Base token is paid/received from surplus collateral
     *                          0x2 - Quote token is paid/received from surplus collateral
     * @return The token base and quote token flows associated with this swap action. 
     *         (Negative indicates a credit paid to the user, positive a debit collected
     *         from the user) */
    function swap (address base, address quote,
                   uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty, uint16 tip,
                   uint128 limitPrice, uint128 minOut,
                   uint8 reserveFlags) reEntrantLock public payable
        returns (int128 baseQuote, int128 quoteFlow) {
        // By default the embedded hot-path is enabled, but protocol governance can
        // disable by toggling the force proxy flag. If so, users should point to
        // swapProxy.
        require(hotPathOpen_);
        return swapExecute(base, quote, poolIdx, isBuy, inBaseQty, qty, tip,
                           limitPrice, minOut, reserveFlags);
    }

    /* @notice Consolidated method for protocol control related commands.
     * @dev    We consolidate multiple protocol control types into a single method to 
     *         reduce the contract size in the main contract by paring down methods.
     * 
     * @param callpath The proxy sidecar callpath called into. (Calls into proxyCmd() on
     *                 the respective sidecare contract)
     * @param cmd      The arbitrary byte calldata corresponding to the command. Format
     *                 dependent on the specific callpath.
     * @param sudo     If true, indicates that the command should be called with elevated
     *                 privileges. */
    function protocolCmd (uint16 callpath, bytes calldata cmd, bool sudo)
        public payable override {
        callProtocolCmd(callpath, cmd);
    }

    /* @notice Calls an arbitrary command on one of the sidecar proxy contracts at a specific
     *         index. Not all proxy slots may have a contract attached. If so, this call will
     *         fail.
     *
     * @param callpath The index of the proxy sidecar the command is being called on.
     * @param cmd The arbitrary call data the client is calling the proxy sidecar.
     * @return Arbitrary byte data (if any) returned by the command. */
    function userCmd (uint16 callpath, bytes calldata cmd) reEntrantLock
        public payable returns (bytes memory) {
        return callUserCmd(callpath, cmd);
    }

    /* @notice Calls an arbitrary command on behalf of another user who has signed an 
     *         EIP-712 off-chain transaction. Same general call logic as userCmd(), but
     *         with additional args for conditions, and relayer payment.
     *
     * @param callpath The index of the proxy sidecar the command is being called on.
     * @param cmd The arbitrary call data the client is calling the proxy sidecar.
     * @param conds An ABI encoded list of evaluation conditions that are required for 
     *              this command to execute. See AgentMask.sol for format of this data.
     * @param relayerTip An ABI encoded directive for tipping the relayer on behalf of
     *                   the underlying client, for having mined the transaction. If this
     *                   byte array is empty no calldata. See AgentMask.sol for format 
     *                   details.
     * @param signature The ERC-712 signature of the above parameters signed by the 
     *                  private key of the public address the command is being executed 
     *                  for.
     * @return Arbitrary byte data (if any) returned by the command. */
    function userCmdRelayer (uint16 callpath, bytes calldata cmd,
                             bytes calldata conds, bytes calldata relayerTip, 
                             bytes calldata signature)
        reEntrantAgent(CrocRelayerCall(callpath, cmd, conds, relayerTip), signature)
        public payable returns (bytes memory output) {
        output = callUserCmd(callpath, cmd);
        tipRelayer(relayerTip);
    }

    /* @notice Calls an arbitrary command on behalf of a user from a (pre-approved) 
     *         external router contract acting as an agent on the user's behalf.
     *
     * @dev This can only be called when the underlying user has previously approved the
     *      msg.sender address as a router on its behalf.
     *
     * @param callpath The index of the proxy sidecar the command is being called on.
     * @param cmd The arbitrary call data the client is calling the proxy sidecar.
     * @param client The address of the client the router is calling on behalf of.
     * @return Arbitrary byte data (if any) returned by the command. */
    function userCmdRouter (uint16 callpath, bytes calldata cmd, address client)
        reEntrantApproved(client, callpath) public payable
        returns (bytes memory) {
        return callUserCmd(callpath, cmd);
    }

    /* @notice General purpose query fuction for reading arbitrary data from the dex.
     * @dev    This function is bare bones, because we're trying to keep the size 
     *         footprint of CrocSwapDex down. See SlotLocations.sol and QueryHelper.sol 
     *         for syntactic sugar around accessing/parsing specific data. */
    function readSlot (uint256 slot) public view returns (uint256 data) {
        assembly {
        data := sload(slot)
        }
    }

    /* @notice Validation function used by external contracts to verify an address is
     *         a valid CrocSwapDex contract. */
    function acceptCrocDex() pure public returns (bool) { return true; }
}


/* @notice Alternative constructor to CrocSwapDex that's more convenient. However
 *     the deploy transaction is several hundred kilobytes and will get droppped by 
 *     geth. Useful for testing environments though. */
contract CrocSwapDexSeed  is CrocSwapDex {
    
    constructor() {
        proxyPaths_[CrocSlots.LP_PROXY_IDX] = address(new WarmPath());
        proxyPaths_[CrocSlots.COLD_PROXY_IDX] = address(new ColdPath());
        proxyPaths_[CrocSlots.LONG_PROXY_IDX] = address(new LongPath());
        proxyPaths_[CrocSlots.MICRO_PROXY_IDX] = address(new MicroPaths());
        proxyPaths_[CrocSlots.FLAG_CROSS_PROXY_IDX] = address(new KnockoutFlagPath());
        proxyPaths_[CrocSlots.KNOCKOUT_LP_PROXY_IDX] = address(new KnockoutLiqPath());
        proxyPaths_[CrocSlots.SAFE_MODE_PROXY_PATH] = address(new SafeModePath());
    }
}

