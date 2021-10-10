// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import './Chaining.sol';

library TokenFlow {

    struct PairSeq {
        address baseToken_;
        address quoteToken_;
        bool isBaseFront_;
        int128 legFlow_;
        Chaining.PairFlow flow_;
    }

    function nextHop (PairSeq memory seq, address tokenFront, address tokenBack)
        pure internal {
        seq.isBaseFront_ = tokenFront < tokenBack;
        if (seq.isBaseFront_) {
            seq.baseToken_ = tokenFront;
            seq.quoteToken_ = tokenBack;
        } else {
            seq.quoteToken_ = tokenFront;
            seq.baseToken_ = tokenBack;
        }
    }

    function frontFlow (PairSeq memory seq) internal pure returns (int128) {
        return seq.isBaseFront_ ? seq.flow_.baseFlow_ : seq.flow_.quoteFlow_;
    }
    function backFlow (PairSeq memory seq) internal pure returns (int128) {
        return seq.isBaseFront_ ? seq.flow_.quoteFlow_ : seq.flow_.baseFlow_;
    }
    function frontToken (PairSeq memory seq) internal pure returns (address) {
        return seq.isBaseFront_ ? seq.baseToken_ : seq.quoteToken_;
    }
    function backToken (PairSeq memory seq) internal pure returns (address) {
        return seq.isBaseFront_ ? seq.quoteToken_ : seq.baseToken_;
    }

    function clipFlow (PairSeq memory seq) internal pure returns (int128 clippedFlow) {
        (int128 frontAccum, int128 backAccum) = seq.isBaseFront_ ?
            (seq.flow_.baseFlow_, seq.flow_.quoteFlow_) :
            (seq.flow_.quoteFlow_, seq.flow_.baseFlow_);
        
        clippedFlow = seq.legFlow_ + frontAccum;
        seq.legFlow_ = backAccum;
        
        seq.flow_.baseFlow_ = 0;
        seq.flow_.quoteFlow_ = 0;
        seq.flow_.baseProto_ = 0;
        seq.flow_.quoteProto_ = 0;
    }
    
    function closeFlow (PairSeq memory seq) internal pure returns (int128) {
        return seq.legFlow_;
    }

    function isEtherNative (address token) internal pure returns (bool) {
        return token == address(0);
    }
}
