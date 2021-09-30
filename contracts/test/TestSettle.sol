// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../mixins/SettleLayer.sol";

contract TestSettleLayer is SettleLayer {

    address private recv_;
    
    constructor (address recv) {
        recv_ = recv;
    }
    
    function testSettleFlow (int256 flow, address token) public payable {
        testSettle(flow, 0, token, type(int256).max, 0, false, false);
    }

    function testSettleRoll (int256 flow, int256 roll, address token) public payable {
        testSettle(flow, roll, token, type(int256).max, 0, false, false);
    }

    function testSettleLimit (int256 flow, address token, int256 limitQty)
        public payable {
        testSettle(flow, 0, token, limitQty, 0, false, false);
    }

    function testSettleDust (int256 flow, address token, uint256 dustThresh)
        public payable {
        testSettle(flow, 0, token, type(int256).max, dustThresh, false, false);  
    }

    function testSettleReserves (int256 flow, address token) public payable {
        testSettle(flow, 0, token, type(int256).max, 0, true, false);
    }

    function testSettleSpent (int256 flow, address token) public payable {
        testSettle(flow, 0, token, type(int256).max, 0, false, true);
    }
    
    function testSettle (int256 flow, int256 roll, address token, int256 limitQty,
                         uint256 dustThresh, bool useReserves,
                         bool spentMsgVal) public payable {
        Directives.SettlementChannel memory dir = Directives.SettlementChannel
            ({token_: token, limitQty_: limitQty, dustThresh_: dustThresh,
                    useReserves_: useReserves});
        RollingSpend memory spend = RollingSpend({spentMsgVal_: spentMsgVal});
        settleHop(recv_, flow, roll, dir, spend);
    }

    function getMyBalance() public view returns (uint256) {
        return getBalance(address(this));
    }

    function getBalance (address tgt) public view returns (uint256) {
        return tgt.balance;
    }
}
