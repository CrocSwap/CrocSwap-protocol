// SPDX-License-Identifier: GPL-3
pragma solidity 0.8.19;

import "../libraries/AuctionLogic.sol";

contract TestAuctionLogic {


    function testHashAuctionPool(address supplyToken, address demandToken, address auctioneer, uint256 auctionSalt) 
        public pure returns (bytes32) {
        return AuctionLogic.hashAuctionPool(supplyToken, demandToken, auctioneer, auctionSalt);
    }

    function testHashAuctionBid(bytes32 auctionKey, address bidder, uint256 bidSalt)
        public pure returns (bytes32) {
        return AuctionLogic.hashAuctionBid(auctionKey, bidder, bidSalt);
    }

    function testGetLevelCapacity(uint256 totalSupply, uint16 level) 
        public pure returns (uint256) {
        return AuctionLogic.getLevelCapacity(totalSupply, level);
    }

    function testGetMcapForLevel(uint16 level)
        public pure returns (uint256) {
        return AuctionLogic.getMcapForLevel(level);
    }

    function testCalcAuctionProceeds(uint16 level, uint256 totalSupply, uint128 bidSize)
        public pure returns (uint128) {
        return AuctionLogic.calcAuctionProceeds(level, totalSupply, bidSize);
    }

    function testDeriveProRataShrink(uint256 cumBids, uint256 levelBids, uint256 totalSupply)
        public pure returns (uint256) {
        return AuctionLogic.deriveProRataShrink(cumBids, levelBids, totalSupply);
    }

    function testCalcClearingLevelShares(uint16 level, uint256 totalSupply, uint128 bidSize, uint256 proRata)
        public pure returns (uint128 shares, uint128 bidRefund) {
        return AuctionLogic.calcClearingLevelShares(level, totalSupply, bidSize, proRata);
    }
}
