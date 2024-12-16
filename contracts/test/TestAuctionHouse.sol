// SPDX-License-Identifier: GPL-3
pragma solidity 0.8.19;

import "../mixins/AuctionHouse.sol";

contract TestAuctionHouse is AuctionHouse {

    function setLockHolder(address lockHolder) public {
        lockHolder_ = lockHolder;
    }

    function testInitAuction(address supplyToken, address demandToken, uint256 auctionIndex, 
        AuctionLogic.PricedAuctionContext memory context) public {
        initAuction(supplyToken, demandToken, auctionIndex, context);
    }

    function testPlaceBid(bytes32 auctionKey, address demandToken, uint128 bidSize, uint16 limitLevel, uint256 bidIndex) public {
        placeBid(auctionKey, demandToken, bidSize, limitLevel, bidIndex);
    }

    function testClaimBid(bytes32 auctionKey, address demandToken, address supplyToken, uint256 bidId) public {
        claimBid(auctionKey, demandToken, supplyToken, bidId);
    }

    function testRefund(address supplyToken, address demandToken, uint256 auctionSalt) public {
        refundAuction(supplyToken, demandToken, auctionSalt);
    }

    function testCancelBid(bytes32 auctionKey, address demandToken, uint256 bidIndex) public {
        cancelBid(auctionKey, demandToken, bidIndex);
    }

    function testIncreaseBid(bytes32 auctionKey, address demandToken, uint256 bidIndex, uint128 deltaSize) public {
        increaseBid(auctionKey, demandToken, bidIndex, deltaSize);
    }

    function testModifyBidLevel(bytes32 auctionKey, uint256 bidIndex, uint16 newLevel) public {
        modifyBidLevel(auctionKey, bidIndex, newLevel);
    }
}
