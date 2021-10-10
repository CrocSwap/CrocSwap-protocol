// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;

import '../libraries/TransferHelper.sol';
import '../libraries/TokenFlow.sol';
import '../libraries/SafeCast.sol';
import './StorageLayout.sol';

/* @title Protocol Account Mixin
 * @notice Tracks and pays out the protocol fees in the dex I.e. these are the
 *         fees belonging to the CrocSwap protocol, not the liquidity miners.
 * @dev Unlike liquidity fees, protocol fees are accumulated as resting tokens 
 *      instead of ambient liquidity. */
contract ProtocolAccount is StorageLayout  {
    using SafeCast for uint256;
    using TokenFlow for address;
    
    /* @notice Called at the completion of a swap event, incrementing any protocol
     *         fees accumulated in the swap. */
    function accumProtocolFees (TokenFlow.PairSeq memory accum) internal {
        if (accum.flow_.baseProto_ > 0) {
            feesAccum_[accum.baseToken_] += accum.flow_.baseProto_;
        }
        if (accum.flow_.quoteProto_ > 0) {
            feesAccum_[accum.quoteToken_] += accum.flow_.quoteProto_;
        }
    }

    /* @notice Pays out the earned, but unclaimed protocol fees in the pool.
     * @param receipient - The receiver of the protocol fees.
     * @param token - The token address of the quote token. */
    function disburseProtocol (address recipient, address token) protocolOnly public {
        uint256 collected = feesAccum_[token];
        feesAccum_[token] = 0;
        if (collected > 0) {
            if (token.isEtherNative()) {
                TransferHelper.safeEtherSend(recipient, collected);
            } else {
                TransferHelper.safeTransfer(token, recipient, collected);
            }
        }
        
    }

    /* @notice Retrieves the balance of the protocol unclaimed fees currently resting
     *         in the pool. */
    function protoFeeAccum (address token) public view returns (uint256) {
        return feesAccum_[token];
    }

    function setProtoAcctAuthority (address authority) internal {
        authority_ = authority;
    }
}
