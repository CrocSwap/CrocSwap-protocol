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
import '../interfaces/ICrocSwapHistRecv.sol';
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
contract ColdPath is MarketSequencer, PoolRegistry, SettleLayer, ProtocolAccount {
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
    function protocolCmd (bytes calldata input) public {
        (uint8 code, address token, address sidecar, uint24 poolIdx, uint24 feeRate,
         uint8 protocolTake, uint16 ticks, uint128 value) = input.decodeProtocolCmd();

        if (code == ProtocolCmd.COLLECT_TREASURY_CODE) {
            collectProtocol(token, sidecar);
            
        } else if (code == ProtocolCmd.AUTHORITY_TRANSFER_CODE) {
            emit CrocEvents.AuthorityTransfer(authority_);
            authority_ = sidecar;
            
        } else if (code == ProtocolCmd.UPGRADE_DEX_CODE) {
            upgradeProxy(sidecar, protocolTake);
            
        } else if (code == ProtocolCmd.FORCE_HOT_CODE) {
            forceHotProxy(protocolTake > 0);
          
        } else if (code == ProtocolCmd.POOL_TEMPLATE_CODE) {
            uint8 jit = value.toUint8();
            setTemplate(poolIdx, feeRate, protocolTake, ticks, sidecar, jit);
            
        } else if (code == ProtocolCmd.POOL_REVISE_CODE) {
            uint8 jit = value.toUint8();
            revisePool(token, sidecar, poolIdx, feeRate, protocolTake, ticks, jit);
            
        } else if (code == ProtocolCmd.INIT_POOL_LIQ_CODE) {
            setNewPoolLiq(value);
            
        } else if (code == ProtocolCmd.OFF_GRID_CODE) {
            pegPriceImprove(token, value, ticks);
        }
    }

    function userCmd (bytes calldata cmd) public payable {
        uint8 cmdCode = uint8(cmd[31]);
        
        if (cmdCode == 1) {
            initPool(cmd);
        } else if (cmdCode == 2) {
            approveRouter(cmd);
        } else if (cmdCode == 3) {
            collectSurplus(cmd);
        }
    }
    
    /* @notice Initializes the pool type for the pair.
     * @param base The base token in the pair.
     * @param quote The quote token in the pair.
     * @param poolIdx The index of the pool type to initialiaze.
     * @param price The price to initialize the pool. Represented as square root price in
     *              Q64.64 notation. */
    function initPool (bytes calldata cmd) private {
        (, address base, address quote, uint24 poolIdx, uint128 price) =
            abi.decode(cmd, (uint8, address,address,uint24,uint128));
        (PoolSpecs.PoolCursor memory pool, uint128 initLiq) =
            registerPool(base, quote, poolIdx);
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
    function setTemplate (uint24 poolIdx, uint24 feeRate,
                          uint8 protocolTake, uint16 tickSize,
                          address permitOracle, uint8 jitThresh) private {
        setPoolTemplate(poolIdx, feeRate, protocolTake, tickSize, permitOracle,
                        jitThresh);
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
    function revisePool (address base, address quote, uint24 poolIdx,
                         uint24 feeRate, uint8 protocolTake, uint16 tickSize,
                         uint8 jitThresh) private {
        setPoolSpecs(base, quote, poolIdx, feeRate, protocolTake, tickSize, jitThresh);
    }

    /* @notice Set off-grid price improvement.
     * @param token The token the settings apply to.
     * @param unitTickCollateral The collateral threshold for off-grid price improvement.
     * @param awayTickTol The maximum tick distance from current price that off-grid
     *                    quotes are allowed for. */
    function pegPriceImprove (address token, uint128 unitTickCollateral,
                              uint16 awayTickTol) private {
        setPriceImprove(token, unitTickCollateral, awayTickTol);
    }

    /* @notice Upgrades one of the existing proxy sidecar contracts.
     * @dev    Be extremely careful calling this, particularly when upgrading the
     *         cold path contract, since that contains the upgrade code itself.
     * @param proxy The address of the new proxy smart contract
     * @param proxyIdx Determines which proxy is upgraded on this call */
    function upgradeProxy (address proxy, uint8 proxyIdx) private {
        emit CrocEvents.UpgradeProxy(proxy, proxyIdx);
        proxyPaths_[proxyIdx] = proxy;        
    }

    /* @notice Upgrades one of the existing proxy sidecar contracts.
     * @dev    Be extremely careful calling this, particularly when upgrading the
     *         cold path contract, since that contains the upgrade code itself.
     * @param proxy The address of the new proxy smart contract
     * @param proxyIdx Determines which proxy is upgraded on this call */
    function forceHotProxy (bool force) private {
        emit CrocEvents.ForceHotProxy(force);
        forceHotProxy_ = force;
        
    }

    /* @notice Pays out the the protocol fees.
     * @param token The token for which the accumulated fees are being paid out. 
     *              (Or if 0x0 pays out native Ethereum.) */
    function collectProtocol (address token, address recv) private {
        disburseProtocolFees(recv, token);
        emit CrocEvents.ProtocolDividend(token, recv);
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
    function collectSurplus (bytes calldata cmd) private {
        (, address recv, int128 value, address token, bool isTransfer) =
            abi.decode(cmd, (uint8, address, int128, address, bool));
        if (value < 0) {
            depositSurplus(recv, uint128(-value), token);
        } else if (isTransfer) {
            moveSurplus(recv, uint128(value), token);
        } else {
            disburseSurplus(recv, uint128(value), token);
        }
    }

    /* @notice Called by a user to give permissions to an external smart contract router.
     * @notice router The address of the external smart contract that the user is giving
     *                permission to.
     * @notice forDebit If true, the user is authorizing the router to pay settlement 
     *                  debits on its behalf.
     * @notice forBurn If true, the user is authorizing the router to burn liquidity
     *                 positions belongining to the user. */
    function approveRouter (bytes calldata cmd) private {
        (, address router, bool forDebit, bool forBurn) =
            abi.decode(cmd, (uint8, address, bool, bool));
        approveAgent(router, forDebit, forBurn);
    }

}

