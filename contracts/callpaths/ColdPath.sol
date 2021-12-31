// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/Directives.sol';
import '../libraries/Encoding.sol';
import '../libraries/TokenFlow.sol';
import '../libraries/PriceGrid.sol';
import '../mixins/SettleLayer.sol';
import '../mixins/PoolRegistry.sol';
import '../mixins/OracleHist.sol';
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

    /* @notice Initializes the pool type for the pair.
     * @param base The base token in the pair.
     * @param quote The quote token in the pair.
     * @param poolIdx The index of the pool type to initialiaze.
     * @param price The price to initialize the pool. Represented as square root price in
     *              Q64.64 notation. */
    function initPool (address base, address quote, uint24 poolIdx,
                       uint128 price) public payable {
        (PoolSpecs.PoolCursor memory pool, uint128 initLiq) =
            registerPool(base, quote, poolIdx);
        (int128 baseFlow, int128 quoteFlow) = initCurve(pool, price, initLiq);
        settleInitFlow(msg.sender, base, baseFlow, quote, quoteFlow);
    }

    /* @notice Consolidated method for protocol control related commands.
     * @dev    We consolidate multiple protocol control types into a single method to 
     *         reduce the contract size in the main contract by paring down methods.
     * 
     * @param code The command code corresponding to the actual method being called.
     *             Code types are as follows:
     *                  65 - Collect protocol fees
     *                  66 - Set pool template parameters
     *                  67 - Set parameters on pre-existing pools.
     *                  68 - Set the size for liquidity locking on pool initialization.
     *                  69 - Set off-grid price improve settings.
     *                  70 - Transfer protocol authority */
    function protocolCmd (bytes calldata input) public {
        (uint8 code, address token, address sidecar, uint24 poolIdx, uint24 feeRate,
         uint8 protocolTake, uint16 ticks, uint128 value) =
            abi.decode(input, (uint8, address, address, uint24, uint24,
                               uint8, uint16, uint128));

        if (code == 65) {
            collectProtocol(token, sidecar);
        } else if (code == 66) {
            uint8 jit = value.toUint8();
            setTemplate(poolIdx, feeRate, protocolTake, ticks, sidecar, jit);
        } else if (code == 67) {
            uint8 jit = value.toUint8();
            revisePool(token, sidecar, poolIdx, feeRate, protocolTake, ticks, jit);
        } else if (code == 68) {
            setNewPoolLiq(value);
        } else if (code == 69) {
            pegPriceImprove(token, value, ticks);
        } else if (code == 70) {
            emit CrocEvents.AuthorityTransfer(authority_);
            authority_ = sidecar;
        } 
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

    /* @notice Pays out the the protocol fees.
     * @param token The token for which the accumulated fees are being paid out. 
     *              (Or if 0x0 pays out native Ethereum.) */
    function collectProtocol (address token, address recv) public {
        disburseProtocolFees(recv, token);
        emit CrocEvents.ProtocolDividend(token, recv);
    }

    /* @notice Used to directly pay out or pay in surplus collateral.
     * @param recv The address where the funds are paid to (only applies if surplus was
     *             paid out.)
     * @param value The amount of surplus collateral being paid or received. If negative
     *              paid from the user into the pool, increasing their balance.
     * @param token The token to which the surplus collateral is applied. (If 0x0, then
     *              native Ethereum) */
    function collectSurplus (address recv, int128 value, address token) public payable {
        if (value < 0) {
            depositSurplus(msg.sender, uint128(-value), token);
        } else {
            disburseSurplus(msg.sender, recv, uint128(value), token);
        }
    }

    /* @notice Called by a user to give permissions to an external smart contract router.
     * @notice router The address of the external smart contract that the user is giving
     *                permission to.
     * @notice forDebit If true, the user is authorizing the router to pay settlement 
     *                  debits on its behalf.
     * @notice forBurn If true, the user is authorizing the router to burn liquidity
     *                 positions belongining to the user. */
    function approveRouter (address router, bool forDebit, bool forBurn) public {
        approveAgent(router, forDebit, forBurn);
    }

}

