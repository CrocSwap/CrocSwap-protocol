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

    function testGetMcapForLevel(uint16 level, uint256 totalSupply)
        public pure returns (uint256) {
        return AuctionLogic.getMcapForLevel(level, totalSupply);
    }

    function testGetPriceForLevel(uint16 level)
        public pure returns (uint256) {
        return AuctionLogic.getPriceForLevel(level);
    }

    function testCalcAuctionProceeds(uint16 level, uint128 bidSize)
        public pure returns (uint128) {
        return AuctionLogic.calcAuctionProceeds(level, bidSize);
    }

    function testDeriveProRataShrink(uint256 cumBids, uint256 levelBids, uint256 totalSupply)
        public pure returns (uint256) {
        return AuctionLogic.deriveProRataShrink(cumBids, levelBids, totalSupply);
    }

    function testCalcClearingLevelShares(uint16 level, uint128 bidSize, uint256 proRata)
        public pure returns (uint128 shares, uint128 bidRefund) {
        return AuctionLogic.calcClearingLevelShares(level, bidSize, proRata);
    }

    function testCalcReservePayout(uint16 level, uint128 totalBids, uint16 totalSupply)
        public pure returns (uint128 supplyReturn, uint128 demandReturn) {
        return AuctionLogic.calcReservePayout(level, totalBids, totalSupply);
    }
}
