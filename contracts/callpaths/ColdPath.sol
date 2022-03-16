// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';
import '../libraries/Encoding.sol';
import '../libraries/TokenFlow.sol';
import '../libraries/PriceGrid.sol';
import '../libraries/ProtocolCmd.sol';
import '../mixins/SettleLayer.sol';
import '../mixins/PoolRegistry.sol';
import '../mixins/MarketSequencer.sol';
import '../mixins/StorageLayout.sol';
import '../mixins/ProtocolAccount.sol';
import '../mixins/DepositDesk.sol';
import '../CrocEvents.sol';

import "hardhat/console.sol";

/* @title Cold path callpath sidecar.
 * @notice Defines a proxy sidecar contract that's used to move code outside the 
 *         main contract to avoid Ethereum's contract code size limit. Contains
 *         top-level logic for non trade related logic, including protocol control,
 *         pool initialization, and surplus collateral payment. 
 * 
 * @dev    This exists as a standalone contract but will only ever contain proxy code,
 *         not state. As such it should never be called directly or externally, and should
 *         only be invoked with DELEGATECALL so that it operates on the contract state
 *         within the primary CrocSwap contract. */
contract ColdPath is MarketSequencer, PoolRegistry, DepositDesk, ProtocolAccount {
    using SafeCast for uint128;
    using TokenFlow for TokenFlow.PairSeq;
    using CurveMath for CurveMath.CurveState;
    using Chaining for Chaining.PairFlow;
    using ProtocolCmd for bytes;

    /* @notice Consolidated method for protocol control related commands.
     * @dev    We consolidate multiple protocol control types into a single method to 
     *         reduce the contract size in the main contract by paring down methods.
     * 
     * @param code The command code corresponding to the actual method being called.
     *             See ProtocolCmd.sol for outline of protocol command codes. */
    function protocolCmd (bytes calldata cmd) public {
        uint8 code = uint8(cmd[31]);

        if (code == ProtocolCmd.POOL_TEMPLATE_CODE) {
            setTemplate(cmd);
        } else if (code == ProtocolCmd.POOL_REVISE_CODE) {
            revisePool(cmd);
        } else if (code == ProtocolCmd.SET_TAKE_CODE) {
            setTakeRate(cmd);
        } else if (code == ProtocolCmd.RELAYER_TAKE_CODE) {
            setRelayerTakeRate(cmd);
        } else if (code == ProtocolCmd.RESYNC_TAKE_CODE) {
            resyncTakeRate(cmd);
        } else if (code == ProtocolCmd.INIT_POOL_LIQ_CODE) {
            setNewPoolLiq(cmd);
        } else if (code == ProtocolCmd.OFF_GRID_CODE) {
            pegPriceImprove(cmd);
        } else {
            sudoCmd(cmd);
        }
    }

    
    function sudoCmd (bytes calldata cmd) private {
        require(sudoMode_ = true, "Sudo");
        uint8 cmdCode = uint8(cmd[31]);
        
        if (cmdCode == ProtocolCmd.COLLECT_TREASURY_CODE) {
            collectProtocol(cmd);
        } else if (cmdCode == ProtocolCmd.AUTHORITY_TRANSFER_CODE) {
            transferAuthority(cmd);
        } else if (cmdCode == ProtocolCmd.UPGRADE_DEX_CODE) {
            upgradeProxy(cmd);
        } else if (cmdCode == ProtocolCmd.HOT_OPEN_CODE) {
            setHotPathOpen(cmd);
        } else if (cmdCode == ProtocolCmd.SAFE_MODE_CODE) {
            setSafeMode(cmd);
        }
    }
    
    function userCmd (bytes calldata cmd) public payable {
        uint8 cmdCode = uint8(cmd[31]);
        
        if (cmdCode == UserCmd.INIT_POOL_CODE) {
            initPool(cmd);
        } else if (cmdCode == UserCmd.APPROVE_ROUTER_CODE) {
            approveRouter(cmd);
        } else if (cmdCode == UserCmd.DEPOSIT_SURPLUS_CODE) {
            depositSurplus(cmd);
        } else if (cmdCode == UserCmd.DISBURSE_SURPLUS_CODE) {
            disburseSurplus(cmd);
        } else if (cmdCode == UserCmd.TRANSFER_SURPLUS_CODE) {
            transferSurplus(cmd);
        } else if (cmdCode == UserCmd.SIDE_POCKET_CODE) {
            sidePocketSurplus(cmd);
        } else if (cmdCode == UserCmd.DEPOSIT_VIRTUAL_CODE) {
            depositVirtual(cmd);
        } else if (cmdCode == UserCmd.DISBURSE_VIRTUAL_CODE) {
            disburseVirtual(cmd);
        } else if (cmdCode == UserCmd.RESET_NONCE) {
            resetNonce(cmd);
        } else if (cmdCode == UserCmd.RESET_NONCE_COND) {
            resetNonceCond(cmd);
        }

    }
    
    /* @notice Initializes the pool type for the pair.
     * @param base The base token in the pair.
     * @param quote The quote token in the pair.
     * @param poolIdx The index of the pool type to initialiaze.
     * @param price The price to initialize the pool. Represented as square root price in
     *              Q64.64 notation. */
    function initPool (bytes calldata cmd) private {
        (, address base, address quote, uint256 poolIdx, uint128 price) =
            abi.decode(cmd, (uint8, address,address,uint256,uint128));
        (PoolSpecs.PoolCursor memory pool, uint128 initLiq) =
            registerPool(base, quote, poolIdx);
                                                   
        verifyPermitInit(pool, base, quote, poolIdx);
        
        (int128 baseFlow, int128 quoteFlow) = initCurve(pool, price, initLiq);
        settleInitFlow(msg.sender, base, baseFlow, quote, quoteFlow);
    }

    /* @notice Sets template parameters for a pool type index.
     * @param poolIdx The index of the pool type.
     * @param feeRate The pool's swap fee rate in multiples of 0.0001%
     * @param protocolTake The protocol take rate represented as 1/n (or 0 if n=0)
     * @param tickSize The pool's grid size in ticks.
     * @param permitOracle The external oracle that permissions pool users (or if set to
     *                     0x0 address pool type is permissionless).
     * @param jitThresh The minimum resting time (in seconds) for concentrated LPs. */
    function setTemplate (bytes calldata input) private {
        (, uint256 poolIdx, uint16 feeRate, uint16 tickSize, uint8 jitThresh,
         uint8 knockout, uint8 oracleFlags) =
            abi.decode(input, (uint8, uint256, uint16, uint16, uint8, uint8, uint8));
        
        emit CrocEvents.SetPoolTemplate(poolIdx, feeRate, tickSize, jitThresh, knockout,
                                        oracleFlags);
        setPoolTemplate(poolIdx, feeRate, tickSize, jitThresh, knockout, oracleFlags);
    }

    function setTakeRate (bytes calldata input) private {
        (, uint8 takeRate) = 
            abi.decode(input, (uint8, uint8));
        
        emit CrocEvents.SetTakeRate(takeRate);
        setProtocolTakeRate(takeRate);
    }

    function setRelayerTakeRate (bytes calldata input) private {
        (, uint8 takeRate) = 
            abi.decode(input, (uint8, uint8));
        
        emit CrocEvents.SetRelayerTakeRate(takeRate);
        relayerTakeRate_ = takeRate;
    }

    function setNewPoolLiq (bytes calldata input) private {
        (, uint128 liq) = 
            abi.decode(input, (uint8, uint128));
        
        emit CrocEvents.SetNewPoolLiq(liq);
        setNewPoolLiq(liq);
    }

    function resyncTakeRate (bytes calldata input) private {
        (, address base, address quote, uint256 poolIdx) = 
            abi.decode(input, (uint8, address, address, uint256));
        
        emit CrocEvents.ResyncTakeRate(base, quote, poolIdx, protocolTakeRate_);
        resyncProtocolTake(base, quote, poolIdx);
    }

    /* @notice Update parameters for a pre-existing pool.
     * @param base The base-side token defining the pool's pair.
     * @param quote The quote-side token defining the pool's pair.
     * @param poolIdx The index of the pool type.
     * @param feeRate The pool's swap fee rate in multiples of 0.0001%
     * @param protocolTake The protocol take rate represented as 1/n (or 0 if n=0)
     * @param tickSize The pool's grid size in ticks.
     * @param jitThresh The minimum resting time (in seconds) for concentrated LPs in
     *                  in the pool. */
    function revisePool (bytes calldata cmd) private {
        (, address base, address quote, uint256 poolIdx,
         uint16 feeRate, uint16 tickSize, uint8 jitThresh, uint8 knockout) =
            abi.decode(cmd, (uint8,address,address,uint256,uint16,uint16,uint8,uint8));
        setPoolSpecs(base, quote, poolIdx, feeRate, tickSize, jitThresh, knockout);
    }

    /* @notice Set off-grid price improvement.
     * @param token The token the settings apply to.
     * @param unitTickCollateral The collateral threshold for off-grid price improvement.
     * @param awayTickTol The maximum tick distance from current price that off-grid
     *                    quotes are allowed for. */
    function pegPriceImprove (bytes calldata cmd) private {
        (, address token, uint128 unitTickCollateral, uint16 awayTickTol) =
            abi.decode(cmd, (uint8, address, uint128, uint16));
        emit CrocEvents.PriceImproveThresh(token, unitTickCollateral, awayTickTol);
        setPriceImprove(token, unitTickCollateral, awayTickTol);
    }

    /* @notice Upgrades one of the existing proxy sidecar contracts.
     * @dev    Be extremely careful calling this, particularly when upgrading the
     *         cold path contract, since that contains the upgrade code itself.
     * @param proxy The address of the new proxy smart contract
     * @param proxyIdx Determines which proxy is upgraded on this call */
    function upgradeProxy (bytes calldata cmd) private {
        (, address proxy, uint16 proxyIdx) =
            abi.decode(cmd, (uint8, address, uint16));
        emit CrocEvents.UpgradeProxy(proxy, proxyIdx);
        proxyPaths_[proxyIdx] = proxy;        
    }

    function setHotPathOpen (bytes calldata cmd) private {
        (, bool open) = abi.decode(cmd, (uint8, bool));
        emit CrocEvents.HotPathOpen(open);
        hotPathOpen_ = open;        
    }

    function setSafeMode (bytes calldata cmd) private {
        (, bool inSafeMode) = abi.decode(cmd, (uint8, bool));
        emit CrocEvents.SafeMode(inSafeMode);
        inSafeMode_ = inSafeMode;        
    }

    /* @notice Pays out the the protocol fees.
     * @param token The token for which the accumulated fees are being paid out. 
     *              (Or if 0x0 pays out native Ethereum.) */
    function collectProtocol (bytes calldata cmd) private {
        (, address recv, address token) =
            abi.decode(cmd, (uint8, address, address));
        emit CrocEvents.ProtocolDividend(token, recv);
        disburseProtocolFees(recv, token);
    }

    function transferAuthority (bytes calldata cmd) private {
        (, address auth) =
            abi.decode(cmd, (uint8, address));
        emit CrocEvents.AuthorityTransfer(authority_);
        authority_ = auth;
    }

    /* @notice Used to directly pay out or pay in surplus collateral.
     * @param recv The address where the funds are paid to (only applies if surplus was
     *             paid out.)
     * @param value The amount of surplus collateral being paid or received. If negative
     *              paid from the user into the pool, increasing their balance.
     * @param token The token to which the surplus collateral is applied. (If 0x0, then
     *              native Ethereum)
     * @param isTransfer If set to true, disburse calls will transfer the surplus 
     *                   collateral balance to the recv address instead of paying. */
    function depositSurplus (bytes calldata cmd) private {
        (, address recv, uint128 value, address token) =
            abi.decode(cmd, (uint8, address, uint128, address));
        depositSurplus(recv, value, token);
    }

    function disburseSurplus (bytes calldata cmd) private {
        (, address recv, int128 value, address token) =
            abi.decode(cmd, (uint8, address, int128, address));
        disburseSurplus(recv, value, token);
    }

    function transferSurplus (bytes calldata cmd) private {
        (, address recv, int128 size, address token) =
            abi.decode(cmd, (uint8, address, int128, address));
        transferSurplus(recv, size, token);
    }

    function sidePocketSurplus (bytes calldata cmd) private {
        (, uint256 fromSalt, uint256 toSalt, int128 value, address token) =
            abi.decode(cmd, (uint8, uint256, uint256, int128, address));
        sidePocketSurplus(fromSalt, toSalt, value, token);
    }

    function depositVirtual (bytes calldata cmd) private {
        (, address recv, uint256 salt, uint128 value) = 
            abi.decode(cmd, (uint8, address, uint256, uint128));
        depositVirtual(recv, salt, value);
    }

    function disburseVirtual (bytes calldata cmd) private {
        (, address tracker, uint256 salt, int128 value, bytes memory args) =
            abi.decode(cmd, (uint8, address, uint256, int128, bytes));
        disburseVirtual(tracker, salt, value, args);
    }

    function resetNonce (bytes calldata cmd) private {
        (, bytes32 salt, uint32 nonce) = 
            abi.decode(cmd, (uint8, bytes32, uint32));
        resetNonce(salt, nonce);
    }
    
    function resetNonceCond (bytes calldata cmd) private {
        (, bytes32 salt, uint32 nonce, address oracle, bytes memory args) = 
            abi.decode(cmd, (uint8,bytes32,uint32,address,bytes));
        resetNonceCond(salt, nonce, oracle, args);
    }

    /* @notice Called by a user to give permissions to an external smart contract router.
     * @notice router The address of the external smart contract that the user is giving
     *                permission to.
     * @notice forDebit If true, the user is authorizing the router to pay settlement 
     *                  debits on its behalf.
     * @notice forBurn If true, the user is authorizing the router to burn liquidity
     *                 positions belongining to the user. */
    function approveRouter (bytes calldata cmd) private {
        (, address router, uint32 nCalls, uint256 salt) =
            abi.decode(cmd, (uint8, address, uint32, uint256));
        approveAgent(router, nCalls, salt);
    }
}

