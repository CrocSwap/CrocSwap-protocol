// SPDX-License-Identifier: Unlicensed

import '../libraries/TransferHelper.sol';
import '../libraries/CurveMath.sol';

import "hardhat/console.sol";

pragma solidity >0.7.1;

contract ProtocolAccount {
    
    uint128 private protoFeesBase_;
    uint128 private protoFeesQuote_;

    function accumProtocolFees (CurveMath.SwapAccum memory accum) internal {
        if (accum.cntx_.inBaseQty_) {
            protoFeesBase_ += uint128(accum.paidProto_);
        } else {
            protoFeesQuote_ += uint128(accum.paidProto_);
        }
    }
    
    function disburseProtocol (address recipient,
                               address tokenQuote, address tokenBase)
        internal returns (uint128 quoteFees, uint128 baseFees) {
        baseFees = protoFeesBase_;
        quoteFees = protoFeesQuote_;
        protoFeesBase_ = 0;
        protoFeesQuote_ = 0;
        transferFees(baseFees, tokenBase, recipient);
        transferFees(quoteFees, tokenQuote, recipient);
    }

    
    function transferFees (uint128 amount, address token,
                           address recipient) private {
        if (amount > 0) {
            TransferHelper.safeTransfer(token, recipient, amount);
        }
    }

    function protoFeeAccum() internal view returns (uint128, uint128) {
        return (protoFeesQuote_, protoFeesBase_);
    }
}
