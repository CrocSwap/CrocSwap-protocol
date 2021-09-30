// SPDX-License-Identifier: Unlicensed                                                          
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import '../libraries/Directives.sol';
import '../libraries/TransferHelper.sol';

import "hardhat/console.sol";

contract SettleLayer {

    struct RollingSpend {
        bool spentMsgVal_;
    }
    
    function settleFlat (address recv, int256 flow,
                         Directives.SettlementChannel memory directive,
                         RollingSpend memory cumulative) internal {
        require(passesLimit(flow, directive), "K");
        if (moreThanDust(flow, directive)) {
            pumpFlow(recv, flow, directive.token_, directive.useReserves_,
                     cumulative);
        }
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
        if (isEtherNative(token) && isDebit(flow)) {
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
        if (isEtherNative(token)) {
            TransferHelper.safeEtherSend(recv, value);
        } else {
            TransferHelper.safeTransfer(token, recv, value);
        }
    }

    function debitTransfer (address recv, uint256 value, address token) private {
        // markCumulative() makes sure that the user can't double spend msg.value
        // on multiple Ether debits.
        if (isEtherNative(token)) {
            require(msg.value >= value, "EC");
        } else {
            TransferHelper.safeTransferFrom(token, recv, address(this), value);
        }
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

    function isEtherNative (address token) private pure returns (bool) {
        return token == address(0);
    }

    
    mapping(bytes32 => uint256) private surplusCollateral_;
    
}

