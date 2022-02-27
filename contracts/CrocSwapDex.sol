// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './libraries/PriceGrid.sol';
import './mixins/MarketSequencer.sol';
import './mixins/SettleLayer.sol';
import './mixins/PoolRegistry.sol';
import './mixins/OracleHist.sol';
import './mixins/MarketSequencer.sol';
import './mixins/ColdInjector.sol';
import './interfaces/ICrocSwapHistRecv.sol';
import './interfaces/ICrocMinion.sol';
import './callpaths/ColdPath.sol';
import './callpaths/WarmPath.sol';
import './callpaths/HotPath.sol';
import './callpaths/LongPath.sol';
import './callpaths/MicroPaths.sol';

import "hardhat/console.sol";

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

    /* @param authority The address of the protocol authority. Only this address will is
     *                  able to call methods related to protocol privileged operations.
     * @param coldPath The address of the pre-deployed ColdPath sidecar contract.
     * @param warmPath The address of the pre-deployed WarmPath sidecar contract.
     * @param warmPath The address of the pre-deployed LongPath sidecar contract.
     * @param warmPath The address of the pre-deployed MicroPath sidecar contract. */
    constructor (address authority, address coldPath, address warmPath,
                 address longPath, address microPath) {
        authority_ = authority;
        proxyPaths_[COLD_PROXY_IDX] = coldPath;
        proxyPaths_[WARM_PROXY_IDX] = warmPath;
        proxyPaths_[LONG_PROXY_IDX] = longPath;
        proxyPaths_[MICRO_PROXY_IDX] = microPath;
    }

    /* @notice Executes the user-defined compound order, constitutiin an arbitrary
     *         combination of mints, burns and swaps across an arbitrary set of pools
     *         across an arbitrary set of pairs.
     *
     * @input  The encoded byte data associated with the user's order directive. See
     *         Encoding.sol and Directives.sol library for information on how to encode
     *         order directives as byte data. */
    function trade (bytes calldata input) reEntrantLock public payable {
        callTradePath(input);
    }

    /* @notice Swaps between two tokens within a single liquidity pool.
     * @param base The base-side token of the pair. (For native Ethereum use 0x0)
     * @param quote The quote-side token of the pair.
     * @param poolIdx The index of the pool type to execute on.
     * @param isBuy If true the direction of the swap is for the user to send base tokens
     *              and receive back quote tokens.
     * @param inBaseQty If true the quantity is denominated in base-side tokens. If not
     *                  use quote-side tokens.
     * @param qty The quantity of tokens to swap. End result could be less if reaches
     *            limitPrice.
     * @param limitPrice The worse price the user is willing to pay on the margin. Swap
     *                   will execute up to this price, but not any worse. Average fill 
     *                   price will always be equal or better, because this is calculated
     *                   at the marginal unit of quantity.
     * @param useSurplus If true, settlement is first attempted with the user's surplus
     *                   collateral balance held at the exchange. (Reduces gas cost 
     *                   associated with an explicit transfer.) */
    function swap (address base, address quote,
                   uint24 poolIdx, bool isBuy, bool inBaseQty, uint128 qty,
                   uint128 limitPrice, uint128 limitStart,
                   uint8 reserveFlags) reEntrantLock public payable {
        // By default the embedded hot-path is enabled, but protocol governance can
        // disable by toggling the force proxy flag. If so, users should point to
        // swapProxy.
        require(!forceHotProxy_, "HP");
        swapExecute(base, quote, poolIdx, isBuy, inBaseQty, qty,
                        limitPrice, limitStart, reserveFlags);
    }

    /* @notice Equality to swap(), but uses the proxy sidecar contract. Less gas 
     *         efficient but clients may want to use if 1) there are upgraded features
     *         in the proxy or 2) forceHotProxy_ has been turned on by protocol 
     *         authority. */
    function swapProxy (bytes calldata input) reEntrantLock public payable {
        callSwapProxy(input);
    }

    /* @notice Like swap(), but if force hot proxy is turned on, will fallback to the
     *         proxy swap() call. Makes the call future-proof, at the expense of 
     *         slightly higher gas. */
    function swapOptimal (bytes calldata input) reEntrantLock public payable {
        if (forceHotProxy_) {
            callSwapProxy(input);
        } else {
            swapEncoded(input);
        }
    }

    /* @notice Consolidated method for all atomic liquidity provider actions.
     * @dev    See the same method's documentation in WarmPath.sol for more details.
     * @param input The encoded LP action. The calling user should abi.pack the 
     *              following parameters into the byte string:
     (                - code (uint8):
     *                   1 - Mint concentrated range liquidity position
     *                   2 - Burn concentrated range liquidity position
     *                   3 - Mint ambient liquidity position.
     *                   4 - Burn ambient liquidity position.
     *                - base (address): Base-side token of the pair. (0x0 for native Eth)
     *                - quote (address): Quote-side token of the pair
     *                - poolIdx (uint24): Index of the pool type
     *                - bidTick (int24): Price tick index of the lower boundary 
     *                                    (if applicable)
     *                - askTick (int24): Price tick index of the upper boundary 
     *                                    (if applicable)
     *                - liq (uint128): Total liquidity to mint or burn.
     *                - limitLow (uint128): Price limit below which the transaction will 
     *                                      not complete
     *                - limitHigh (uint128): Price limit below which the transaction will 
     *                                       not complete.
     *                - useSurplus (bool): If true settle using surplus collateral balance
     *                                     at the exchange. */
    function tradeWarm (bytes calldata input) reEntrantLock public payable {
        callWarmPath(input);
    }

    /* @notice Initializes the pool type for the pair.
     * @param base The base token in the pair.
     * @param quote The quote token in the pair.
     * @param poolIdx The index of the pool type to initialiaze.
     * @param price The price to initialize the pool. Represented as square root price in
     *              Q64.64 notation. */    
    function initPool (address base, address quote, uint24 poolIdx, uint128 price)
        reEntrantLock public payable {
        callInitPool(base, quote, poolIdx, price);
    }

    /* @notice Adds or returns surplus collateral held at the exchange
     * @param token The token for which the accumulated fees are being paid out. 
     *              (Or if 0x0 pays out native Ethereum.) */
    function collectSurplus (address recv, int128 value, address token, bool isTransfer)
        reEntrantLock public payable {
        callCollectSurplus(recv, value, token, isTransfer);
    }

    /* @notice Called by a user to give permissions to an external smart contract router.
     * @notice router The address of the external smart contract that the user is giving
     *                permission to.
     * @notice forDebit If true, the user is authorizing the router to pay settlement 
     *                  debits on its behalf.
     * @notice forBurn If true, the user is authorizing the router to burn liquidity
     *                 positions belongining to the user. */
    function approveRouter (address router, bool forDebit, bool forBurn)
        reEntrantLock public {
        callApproveRouter(router, forDebit, forBurn);
    }

    /* @notice Consolidated method for protocol control related commands.
     * @dev    We consolidate multiple protocol control types into a single method to 
     *         reduce the contract size in the main contract by paring down methods.
     * 
     * @param code The command code corresponding to the actual method being called. */
    function protocolCmd (bytes calldata input) protocolOnly public override {
        callProtocolCmd(input);
    }

    /* @notice Calls an arbitrary command on one of the 64 spill sidecars. Currently
     *         none are in use (all slots are set to 0 and therefore calls will fail).
     *         But this lets protocol governance add new functionality in additional 
     *         sidecars, which can then be accessed by users through this command.
     *
     * @param spillIdx The index (0-63) of the spill sidecar the command is being sent to
     * @param input The arbitrary call data the client is calling the spill proxy 
     *              sidecar with */
    function spillPathCmd (uint8 spillIdx, bytes calldata input) reEntrantLock
        public payable {
        callSpillPath(spillIdx, input);
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
}


/* @notice Alternative contrurctor to CrocSwapDex that's more convenient. However
 *     the deploy transaction is several hundred kilobytes and will get droppped by 
 *     geth. Useful for testing environments though. */
contract CrocSwapDexSeed  is CrocSwapDex {
    
    constructor (address authority)
        CrocSwapDex(authority,
                    address(new ColdPath()),
                    address(new WarmPath()),
                    address(new LongPath()),
                    address(new MicroPaths())) { }
}

