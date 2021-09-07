// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;

import "../libraries/CurveMath.sol";
import "../mixins/ProtocolAccount.sol";

contract TestProtocolAccount is ProtocolAccount {

    address tokenBase_;
    address tokenQuote_;
    address client_;
    
    constructor (address tokenBase, address tokenQuote, address client) {
        tokenBase_ = tokenBase;
        tokenQuote_ = tokenQuote;
        client_ = client;
    }
    
    function testAccum (uint256 paid, bool inBase) public {
        CurveMath.SwapFrame memory cntx = CurveMath.SwapFrame(true, inBase, 0, 0);
        CurveMath.SwapAccum memory swap = CurveMath.SwapAccum(0, 0, 0, paid, cntx);
        accumProtocolFees(swap);
    }

    function testDisburse() public {
        disburseProtocol(client_, tokenBase_, tokenQuote_);
    }

    function getAccum() public view returns (uint256, uint256) {
        return protoFeeAccum();
    }
}
