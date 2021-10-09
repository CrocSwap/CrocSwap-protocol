// SPDX-License-Identifier: Unlicensed
pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import "../libraries/CurveMath.sol";
import "../mixins/ProtocolAccount.sol";

contract TestProtocolAccount is ProtocolAccount {
    using TokenFlow for TokenFlow.PairSeq;
        
    constructor (address auth) {
        setProtoAcctAuthority(auth);
    }
    
    function testAccum (address base, address quote,
                        uint256 baseFees, uint256 quoteFees) public {
        TokenFlow.PairSeq memory pair = TokenFlow.initSeq();
        pair.nextHop(base, quote);
        pair.flow_.baseProto_ = baseFees;
        pair.flow_.quoteProto_ = quoteFees;
        accumProtocolFees(pair);
    }

    function noop() payable public { }

    function etherBalance (address x) public view returns (uint256) {
        return x.balance;
    }
}
