// SPDX-License-Identifier: GPL-3
pragma solidity 0.8.19;

import "../mixins/AuctionHouse.sol";

contract TestAuctionLedger is AuctionLedger {
    using SafeCast for uint256;

    function testInitAuctionLedger(address supplyToken, address demandToken, uint256 auctionIndex,
        AuctionLogic.PricedAuctionContext memory context) public returns (bytes32) {
        lockHolder_ = msg.sender;
        return initAuctionLedger(supplyToken, demandToken, auctionIndex, context);
    }

    function testPlaceBidLedger(bytes32 auctionKey, uint128 bidSize, uint16 limitLevel, uint256 bidIndex) 
        public returns (uint16) {
        lockHolder_ = msg.sender;
        return placeBidLedger(auctionKey, bidSize, limitLevel, bidIndex);
    }

    function testClaimBidLedger(bytes32 auctionKey, uint256 bidId) public 
        returns (uint128 shares, uint128 bidRefund) {
        lockHolder_ = msg.sender;
        return claimBidLedger(auctionKey, bidId);
    }

    function testRefundFailedLedger(address supplyToken, address demandToken, uint256 auctionSalt)
        public view returns (bytes32 auctionKey, uint128 supplyReturn) {
        return refundFailedLedger(supplyToken, demandToken, auctionSalt);
    }

    function testCancelBidLedger(bytes32 auctionKey, uint256 bidIndex) public 
        returns (uint128) {
        lockHolder_ = msg.sender;
        return cancelBidLedger(auctionKey, bidIndex);
    }

    function testIncreaseBidLedger(bytes32 auctionKey, uint256 bidIndex, uint128 deltaSize) public {
        lockHolder_ = msg.sender;
        increaseBidLedger(auctionKey, bidIndex, deltaSize);
    }

    function testModifyBidLevelLedger(bytes32 auctionKey, uint256 bidIndex, uint16 newLimitLevel) public {
        lockHolder_ = msg.sender;
        modifyBidLevelLedger(auctionKey, bidIndex, newLimitLevel);
    }

    // Helper functions to read state
    function getAuctionContext(bytes32 auctionKey) public view returns (AuctionLogic.PricedAuctionContext memory) {
        return auctionContexts_[auctionKey];
    }

    function getAuctionState(bytes32 auctionKey) public view returns (AuctionLogic.PricedAuctionState memory) {
        return auctionStates_[auctionKey];
    }

    function getAuctionBid(bytes32 bidKey) public view returns (AuctionLogic.PricedAuctionBid memory) {
        return auctionBids_[bidKey];
    }

    function getLevelSize(bytes32 auctionKey, uint16 level) public view returns (uint128) {
        return auctionLevelSizes_[auctionKey][level];
    }
}

