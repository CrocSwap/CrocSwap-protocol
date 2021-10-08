// SPDX-License-Identifier: Unlicensed                                                          
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import '../libraries/Directives.sol';
import '../libraries/TransferHelper.sol';
import '../libraries/TokenFlow.sol';

import "hardhat/console.sol";

contract SettleLayer {
    using TokenFlow for address;

    struct RollingSpend {
        bool spentMsgVal_;
    }

    function initSettleRoll() internal pure returns (RollingSpend memory) {
        return RollingSpend({spentMsgVal_: false});
    }
    
    function settleFlat (address recv, int256 flow,
                         Directives.SettlementChannel memory directive,
                         RollingSpend memory cumulative) internal {
        require(passesLimit(flow, directive), "K");
        if (moreThanDust(flow, directive)) {
            pumpFlow(recv, flow, directive.token_, directive.useSurplus_,
                     cumulative);
        }
    }

    function settleInitFlow (address recv, address base, int256 baseFlow,
                             address quote, int256 quoteFlow) internal {
        transactFlow(recv, baseFlow, base, false);
        transactFlow(recv, quoteFlow, quote, false);
    }
        
    function pumpFlow (address recv, int256 flow, address token, bool useReserves,
                       RollingSpend memory cumulative) private {
        transactFlow(recv, flow, token, useReserves);
        markCumulative(cumulative, token, flow);
    }

    function querySurplus (address user, address token) public view returns (uint256) {
        bytes32 key = encodeSurplusKey(user, token);
        return surplusCollateral_[key];
    }

    function markCumulative (RollingSpend memory cumulative,
                             address token, int256 flow) private pure {
        if (token.isEtherNative() && isDebit(flow)) {
            require(!cumulative.spentMsgVal_, "DS");
            cumulative.spentMsgVal_ = true;
        }
    }

    function isDebit (int256 flow) private pure returns (bool) {
        return flow > 0;
    }

    function transactFlow (address recv, int256 flow, address token, bool useReserves)
        private {
        if (isDebit(flow)) {
            debitUser(recv, uint256(flow), token, useReserves);
        } else {
            creditUser(recv, uint256(-flow), token, useReserves);            
        }   
        
    }
    
    function debitUser (address recv, uint256 value, address token,
                        bool useReserves) private {
        uint256 debit = value;
        if (useReserves) {
            debit = debitSurplus(recv, value, token);
        }
        if (debit > 0) {
            debitTransfer(recv, debit, token);
        }
    }

    function creditUser (address recv, uint256 value, address token,
                         bool useReserves) private {
        if (useReserves) {
            creditSurplus(recv, value, token);
        } else if (value > 0) {
            creditTransfer(recv, value, token);
        }
    }

    function creditTransfer (address recv, uint256 value, address token) private {
        if (token.isEtherNative()) {
            TransferHelper.safeEtherSend(recv, value);
        } else {
            TransferHelper.safeTransfer(token, recv, value);
        }
    }

    function debitTransfer (address recv, uint256 value, address token) private {
        // markCumulative() makes sure that the user can't double spend msg.value
        // on multiple Ether debits.
        if (token.isEtherNative()) {
            require(msg.value >= value, "EC");
        } else {
            collectToken(recv, value, token);
        }
    }

    function collectToken (address recv, uint256 value, address token) private {
        uint256 openBal = IERC20Minimal(token).balanceOf(address(this));
        TransferHelper.safeTransferFrom(token, recv, address(this), value);
        uint256 postBal = IERC20Minimal(token).balanceOf(address(this));
        require(postBal > openBal &&
                postBal - openBal >= value, "TD");
    }

    function creditSurplus (address recv, uint256 value, address token) private {
        bytes32 key = encodeSurplusKey(recv, token);
        surplusCollateral_[key] += value;
    }


    function debitSurplus (address recv, uint256 value, address token) private
        returns (uint256 remainder) {
        bytes32 key = encodeSurplusKey(recv, token);
        uint256 balance = surplusCollateral_[key];

        if (balance > value) {
            surplusCollateral_[key] -= value;
        } else {
            surplusCollateral_[key] = 0;
            remainder = value - balance;
        }
    }

    function passesLimit (int256 flow, Directives.SettlementChannel memory dir)
        private pure returns (bool) {
        return flow <= dir.limitQty_;
    }

    function moreThanDust (int256 flow, Directives.SettlementChannel memory dir)
        private pure returns (bool) {
        if (isDebit(flow)) {
            return true;
        } else {
            return uint256(-flow) > dir.dustThresh_;
        }
    }

    function encodeSurplusKey (address owner, address token) private
        pure returns (bytes32) {
        return keccak256(abi.encode(owner, token));
    }

    
    mapping(bytes32 => uint256) private surplusCollateral_;
    
}

