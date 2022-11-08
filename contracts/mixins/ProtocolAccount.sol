// SPDX-License-Identifier: GPL-3

pragma solidity ^0.8.4;

import '../libraries/TransferHelper.sol';
import '../libraries/TokenFlow.sol';
import '../libraries/SafeCast.sol';
import './StorageLayout.sol';

/* @title Protocol Account Mixin
 * @notice Tracks and pays out the accumulated protocol fees across the entire exchange 
 *         These are the fees belonging to the CrocSwap protocol, not the liquidity 
 *         miners.
 * @dev Unlike liquidity fees, protocol fees are accumulated as resting tokens 
 *      instead of ambient liquidity. */
contract ProtocolAccount is StorageLayout  {
    using SafeCast for uint256;
    using TokenFlow for address;
    
    /* @notice Called at the completion of a swap event, incrementing any protocol
     *         fees accumulated in the swap. */
    function accumProtocolFees (TokenFlow.PairSeq memory accum) internal {
        accumProtocolFees(accum.flow_, accum.baseToken_, accum.quoteToken_);
    }

    /* @notice Increments the protocol's account with the fees collected on the pair. */
    function accumProtocolFees (Chaining.PairFlow memory accum,
                                address base, address quote) internal {
        if (accum.baseProto_ > 0) {
            feesAccum_[base] += accum.baseProto_;
        }
        if (accum.quoteProto_ > 0) {
            feesAccum_[quote] += accum.quoteProto_;
        }
    }

    /* @notice Pays out the earned, but unclaimed protocol fees in the pool.
     * @param recv - The receiver of the protocol fees.
     * @param token - The token address of the quote token. */
    function disburseProtocolFees (address recv, address token) internal {
        uint128 collected = feesAccum_[token];
        feesAccum_[token] = 0;
        if (collected > 0) {
            bytes32 payoutKey = keccak256(abi.encode(recv, token));
            userBals_[payoutKey].surplusCollateral_ += collected;
        }
    }
}
