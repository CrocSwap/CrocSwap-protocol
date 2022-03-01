// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../mixins/SettleLayer.sol";

contract TestSettleLayer is SettleLayer {

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
    
    function testSettleFlow (int128 flow, address token) public payable {
        testSettle(flow, token, type(int128).max, 0, false);
    }

    function testSettleLimit (int128 flow, address token, int128 limitQty)
        public payable {
        testSettle(flow, token, limitQty, 0, false);
    }

    function testSettleDust (int128 flow, address token, uint128 dustThresh)
        public payable {
        testSettle(flow, token, type(int128).max, dustThresh, false);  
    }

    function testSettleReserves (int128 flow, address token) public payable {
        testSettle(flow, token, type(int128).max, 0, true);
    }

    function testSettle (int128 flow, address token, int128 limitQty,
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
                           address token) internal {
        depositSurplus(owner, value, token);
    }

    function testDisburse (address owner, address recv, uint128 value,
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
