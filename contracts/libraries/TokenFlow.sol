// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

library TokenFlow {

    struct PairSeq {
        address baseToken_;
        address quoteToken_;
        int256 baseAccum_;
        int256 quoteAccum_;
        int256 rolledFlow_;
        bool isBaseFront_;
    }

    function initSeq() pure internal returns (PairSeq memory) {
        return PairSeq({baseToken_: address(0), quoteToken_: address(0),
                    baseAccum_: 0, quoteAccum_: 0, rolledFlow_: 0,
                    isBaseFront_: false });
    }

    function accumFlow (PairSeq memory seq, int256 baseFlow, int256 quoteFlow)
        pure internal {
        seq.baseAccum_ += baseFlow;
        seq.quoteAccum_ += quoteFlow;
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

    function clipFlow (PairSeq memory seq) internal pure returns (int256 clippedFlow) {
        (int256 frontFlow, int256 backFlow) = seq.isBaseFront_ ?
            (seq.baseAccum_, seq.quoteAccum_) :
            (seq.quoteAccum_, seq.baseAccum_);
        clippedFlow = seq.rolledFlow_ + frontFlow;
        seq.rolledFlow_ = backFlow;
    }
    
    function closeFlow (PairSeq memory seq) internal pure returns (int256) {
        return seq.rolledFlow_;
    }
    
}
