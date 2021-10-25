// SPDX-License-Identifier: Unlicensed

pragma solidity >=0.8.4;
pragma experimental ABIEncoderV2;

import './Chaining.sol';

/* @title Token flow library
 * @notice Provides a facility for joining token flows for trades that occur on an 
 *         arbitrary length chain of overlapping pairs. */
library TokenFlow {

    /* @notice Represents the current hop within a chain of pair hops.
     * @param baseToken_ The base token in the current pair. (If zero native Ethereum)
     * @param quoteToken_ The quote token in the current pair.
     * @param isBaseFront_ If true, then the base side of the pair represents the entry
     *                     token on this hop in the chain.
     * @param legFlow_ - Represents the total flow from the exit side on the previous pair
     *                   hop in the chain.
     * @param flow_ - Accumulator to collect the flow on this pair hop. */
    struct PairSeq {
        address baseToken_;
        address quoteToken_;
        bool isBaseFront_;
        int128 legFlow_;
        Chaining.PairFlow flow_;
    }

    /* @notice Moves the PairSeq cursor object onto the next pair in a hop.
     *
     * @dev    Note tthat this doesn't process, roll or reset flows. All of the 
     *         bookeeping related to this and settlement should be done *before* calling
     *         this on the next pair. 
     *
     * @param seq The cursor object, pair tokens will be updated after call.
     * @param tokenFront The token associated with the front or entry of the chain's 
     *                   next pair hop.
     * @param tokenBack The token associated with the back or exit of the chain's 
     *                  next pair hop. */     
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

    /* @notice Returns the token flow for the front/entry side of the pair hop. */
    function frontFlow (PairSeq memory seq) internal pure returns (int128) {
        return seq.isBaseFront_ ? seq.flow_.baseFlow_ : seq.flow_.quoteFlow_;
    }

    /* @notice Returns the token flow for the back/exit side of the pair hop. */
    function backFlow (PairSeq memory seq) internal pure returns (int128) {
        return seq.isBaseFront_ ? seq.flow_.quoteFlow_ : seq.flow_.baseFlow_;
    }

    /* @notice Returns the token at the front/entry side of the pair hop. */
    function frontToken (PairSeq memory seq) internal pure returns (address) {
        return seq.isBaseFront_ ? seq.baseToken_ : seq.quoteToken_;
    }

    /* @notice Returns the token at the back/exit side of the pair hop. */
    function backToken (PairSeq memory seq) internal pure returns (address) {
        return seq.isBaseFront_ ? seq.quoteToken_ : seq.baseToken_;
    }

    /* @notice Called when all the flows have been tallied and finalized for this
     *         pair hop in the chain. Resets and rolls the object and returns the net
     *         flows to be settled between user and exchange.
     *
     * @param seq The PairSeq cursor object. Aftering calling the object will be updated 
     *            to have the back/exit flow rolled into the leg for the next hop, and 
     *            the previous accumulators will be reset.
     *
     * @return clippedFlow The net flow (inclusive of the rolled leg flow from the 
     *                     previous hop) on the front/entry side of the pair to be 
     *                     settled. Negative indicates credit from dex to user, positive
     *                     indicates debit from user to dex.*/
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

    /* @notice Returns the final flow to be settled associated with the closing leg at 
     *         the end of the chain of pair hops. Negative means credit from dex to user.
     *         Positive is debit from user to dex. */
    function closeFlow (PairSeq memory seq) internal pure returns (int128) {
        return seq.legFlow_;
    }

    /* @notice If true, indicates that the asset-specifying address represents native 
     *         Ethereum. Otherwise it should be the valid address of the ERC20 token 
     *         tracker. */
    function isEtherNative (address token) internal pure returns (bool) {
        return token == address(0);
    }
}
