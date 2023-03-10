// SPDX-License-Identifier: GPL-3
pragma solidity 0.8.19;
    
import "../mixins/DepositDesk.sol";

contract TestSettleLayer is DepositDesk {

    address private recv_;
    address private send_;
    int128 public ethFlow;
    bool public isFinal_;
    
    constructor (address recv) {
        recv_ = recv;
        send_ = recv;
    }
    
    function fund() public payable { }

    function setFinal (bool isFinal) public {
        isFinal_ = isFinal;
    }

    function testQuerySurplus (address recv, address token) public
        view returns (uint128) {
        return super.querySurplus(recv, token);
    }
    
    function testSettleFlow (int128 flow, address token) reEntrantLock public payable {
        testSettleInner(flow, token, type(int128).max, 0, false);
    }

    function testSettleFlowTwo (int128 flowOne, int128 flowTwo,
                                address token) reEntrantLock public payable {
        testSettleInner(flowOne, token, type(int128).max, 0, false);
        testSettleInner(flowTwo, token, type(int128).max, 0, false);
    }

    function testSettleLimit (int128 flow, address token, int128 limitQty)
        reEntrantLock public payable {
        testSettleInner(flow, token, limitQty, 0, false);
    }

    function testSettleDust (int128 flow, address token, uint128 dustThresh)
        reEntrantLock public payable {
        testSettleInner(flow, token, type(int128).max, dustThresh, false);  
    }

    function testSettleReserves (int128 flow, address token) reEntrantLock public payable {
        testSettleInner(flow, token, type(int128).max, 0, true);
    }

    function testSettle (int128 flow, address token, int128 limitQty,
                         uint128 dustThresh, bool useSurplus) reEntrantLock public payable {
        testSettleInner(flow, token, limitQty, dustThresh, useSurplus);
    }

    function testSettleInner (int128 flow, address token, int128 limitQty,
                              uint128 dustThresh, bool useSurplus) public payable {
        Directives.SettlementChannel memory dir = Directives.SettlementChannel
            ({token_: token, limitQty_: limitQty, dustThresh_: dustThresh,
                    useSurplus_: useSurplus});
        if (isFinal_) {
            settleFinal(recv_, send_, flow, dir, ethFlow);
        } else {
            ethFlow += settleLeg(recv_, send_, flow, dir);
        }
    }

    function testDesposit (address owner, uint128 value,
                           address token) reEntrantLock internal {
        depositSurplus(owner, value, token);
    }

    function testDepositTwice (address owner, uint128 valueOne, uint128 valueTwo,
                               address token) reEntrantLock internal {
        depositSurplus(owner, valueOne, token);
        depositSurplus(owner, valueTwo, token);
    }

    function testDisburse (address owner, address recv, int128 value,
                           address token) internal {
        lockHolder_ = owner;
        disburseSurplus(recv, value, token);
    }

    function getMyBalance() public view returns (uint256) {
        return getBalance(address(this));
    }

    function getBalance (address tgt) public view returns (uint256) {
        return tgt.balance;
    }

}
