// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
    
import "../mixins/SettleLayer.sol";

contract TestSettleLayer is SettleLayer {

    address private recv_;
    bool public hasSpentEth;
    
    constructor (address recv) {
        recv_ = recv;
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
        hasSpentEth = settleFlat(recv_, flow, dir, hasSpentEth);
    }

    function getMyBalance() public view returns (uint256) {
        return getBalance(address(this));
    }

    function getBalance (address tgt) public view returns (uint256) {
        return tgt.balance;
    }

}
