// SPDX-License-Identifier: Unlicensed

import '../libraries/TransferHelper.sol';
import '../libraries/CurveMath.sol';

pragma solidity >0.7.1;

/* @title Protocol Account Mixin
 * @notice Tracks and pays out the protocol fees in the pool I.e. these are the
 *         fees belonging to the CrocSwap protocol, not the liquidity miners.
 * @dev Unlike liquidity fees, protocol fees are accumulated as resting tokens 
 *      instead of ambient liquidity. */
contract ProtocolAccount {

    uint256 private protoFeesBase_;
    uint256 private protoFeesQuote_;

    /* @notice Called at the completion of a swap event, incrementing any protocol
     *         fees accumulated in the swap. */
    function accumProtocolFees (CurveMath.SwapAccum memory accum) internal {
        if (accum.cntx_.inBaseQty_) {
            protoFeesBase_ += accum.paidProto_;
        } else {
            protoFeesQuote_ += accum.paidProto_;
        }
    }

    /* @notice Pays out the earned, but unclaimed protocol fees in the pool.
     * @param receipient - The receiver of the protocol fees.
     * @param tokenQuote - The token address of the quote token.
     * @param tokenBase - The token address of the base token.
     * @return quoteFees - The amount of collected quote token fees that were resting
     *                     before the disburse call. (Note after this call, these will
     *                     be fully paid out.)
     * @return baseFees - The amount of collected quote token fees that were resting
     *                    before the disburse call. */
    function disburseProtocol (address recipient,
                               address tokenQuote, address tokenBase)
        internal returns (uint256 quoteFees, uint256 baseFees) {
        baseFees = protoFeesBase_;
        quoteFees = protoFeesQuote_;
        protoFeesBase_ = 0;
        protoFeesQuote_ = 0;
        transferFees(baseFees, tokenBase, recipient);
        transferFees(quoteFees, tokenQuote, recipient);
    }

    
    function transferFees (uint256 amount, address token,
                           address recipient) private {
        if (amount > 0) {
            TransferHelper.safeTransfer(token, recipient, amount);
        }
    }

    /* @notice Retrieves the balance of the protocol unclaimed fees currently resting
     *         in the pool. */
    function protoFeeAccum() internal view returns (uint256, uint256) {
        return (protoFeesQuote_, protoFeesBase_);
    }
}
