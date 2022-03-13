// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import './libraries/Directives.sol';
import './libraries/Encoding.sol';
import './libraries/TokenFlow.sol';
import './libraries/PriceGrid.sol';
import './mixins/MarketSequencer.sol';
import './mixins/SettleLayer.sol';
import './mixins/PoolRegistry.sol';
import './mixins/MarketSequencer.sol';
import './mixins/ColdInjector.sol';
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
        hotPathOpen_ = true;
        proxyPaths_[CrocSlots.ADMIN_PROXY_IDX] = coldPath;
        proxyPaths_[CrocSlots.BAL_PROXY_IDX] = coldPath;
        proxyPaths_[CrocSlots.LP_PROXY_IDX] = warmPath;
        proxyPaths_[CrocSlots.LONG_PROXY_IDX] = longPath;
        proxyPaths_[CrocSlots.MICRO_PROXY_IDX] = microPath;
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
     * @param minOut The minimum output the user expects from the swap. If less is 
     *               returned, the transaction will revery. (Alternatively if the swap
     *               is fixed in terms of output, this is the maximum input.)
     * @param useSurplus If true, settlement is first attempted with the user's surplus
     *                   collateral balance held at the exchange. (Reduces gas cost 
     *                   associated with an explicit transfer.)
     * @return The total token quantity in the output (input) for swaps where quantity
     *         is fixed in input (output). */
    function swap (address base, address quote,
                   uint256 poolIdx, bool isBuy, bool inBaseQty, uint128 qty, uint16 tip,
                   uint128 limitPrice, uint128 minOut,
                   uint8 reserveFlags) reEntrantLock public payable returns (int128) {
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
     * @param code The command code corresponding to the actual method being called. */
    function protocolCmd (uint16 callpath, bytes calldata cmd, bool sudo)
        protocolOnly(sudo) public payable override returns (bytes memory) {
        return callProtocolCmd(callpath, cmd);
    }

    /* @notice Calls an arbitrary command on one of the 64 spill sidecars. Currently
     *         none are in use (all slots are set to 0 and therefore calls will fail).
     *         But this lets protocol governance add new functionality in additional 
     *         sidecars, which can then be accessed by users through this command.
     *
     * @param spillIdx The index (0-63) of the spill sidecar the command is being sent to
     * @param input The arbitrary call data the client is calling the spill proxy 
     *              sidecar with */
    function userCmd (uint16 callpath, bytes calldata cmd) reEntrantLock
        public payable returns (bytes memory) {
        return callUserCmd(callpath, cmd);
    }

    function userCmdRelayer (uint16 proxyIdx, bytes calldata cmd,
                             bytes calldata conds, bytes calldata relayerTip, 
                             bytes calldata signature)
        reEntrantAgent(CrocRelayerCall(proxyIdx, cmd, conds, relayerTip), signature)
        public payable returns (bytes memory output) {
        output = callUserCmd(proxyIdx, cmd);
        tipRelayer(relayerTip);
    }

    function userCmdRouter (uint16 proxyIdx, bytes calldata input, address client,
                            uint256 salt)
        reEntrantApproved(client, salt) public payable
        returns (bytes memory) {
        return callUserCmd(proxyIdx, input);
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

