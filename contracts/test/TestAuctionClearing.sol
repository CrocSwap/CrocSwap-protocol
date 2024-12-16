// SPDX-License-Identifier: GPL-3
pragma solidity 0.8.19;

import "../mixins/AuctionHouse.sol";

contract TestAuctionClearing is AuctionClearing {

    function testCollectSupplyAuction(bytes32 auctionKey, address supplyToken, uint128 amount) public {
        collectSupplyAuction(auctionKey, supplyToken, amount);
    }

    function testCollectDemandAuction(bytes32 auctionKey, address demandToken, uint128 amount) public {
        collectDemandAuction(auctionKey, demandToken, amount);
    }

    function testPayoutSupplyAuction(bytes32 auctionKey, address supplyToken, uint128 amount) public {
        payoutSupplyAuction(auctionKey, supplyToken, amount);
    }

    function testPayoutDemandAuction(bytes32 auctionKey, address demandToken, uint128 amount) public {
        payoutDemandAuction(auctionKey, demandToken, amount);
    }
}
