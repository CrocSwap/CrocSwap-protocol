// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import '../mixins/AuctionHouse.sol';

contract AuctionPath is AuctionHouse {

    function userCmd (bytes calldata cmd) external payable {
        uint8 code = uint8(cmd[0]);

        if (code == 0) {
            initAuctionCmd(cmd);
        } else if (code == 1) {
            placeBidCmd(cmd);
        } else if (code == 2) {
            claimBidCmd(cmd);
        } else if (code == 3) {
            cancelBidCmd(cmd);
        } else if (code == 4) {
            increaseBidCmd(cmd);
        } else if (code == 5) {
            modifyBidLevelCmd(cmd);
        } else if (code == 6) {
            refundFailedAuctionCmd(cmd);
        } else {
            revert("Invalid code");
        }
    }

    function initAuctionCmd (bytes calldata cmd) private {
        (, address supplyToken, address demandToken, uint256 auctionIndex,
            uint32 auctionEndTime, uint128 auctionSupply, uint16 startLevel) = 
            abi.decode(cmd, (uint8, address, address, uint256, uint32, uint128, uint16));

        AuctionLogic.PricedAuctionContext memory context = AuctionLogic.PricedAuctionContext({
            auctionEndTime_: auctionEndTime,
            auctionSupply_: auctionSupply,
            startLevel_: startLevel
        });

        initAuction(supplyToken, demandToken, auctionIndex, context);
    }

    function placeBidCmd (bytes calldata cmd) private {
        (, bytes32 auctionKey, address demandToken, uint128 bidSize, 
            uint16 limitLevel, uint256 bidIndex) = 
            abi.decode(cmd, (uint8, bytes32, address, uint128, uint16, uint256));

        placeBid(auctionKey, demandToken, bidSize, limitLevel, bidIndex);
    }

    function claimBidCmd (bytes calldata cmd) private {
        (, address supplyToken, address demandToken, uint256 bidId) = 
            abi.decode(cmd, (uint8, address, address, uint256));

        bytes32 auctionKey = AuctionLogic.hashAuctionPool(supplyToken, demandToken, lockHolder_, bidId);
        claimBid(auctionKey, demandToken, supplyToken, bidId);
    }

    function cancelBidCmd (bytes calldata cmd) private {
        (, address supplyToken, address demandToken, uint256 bidIndex) = 
            abi.decode(cmd, (uint8, address, address, uint256));

        bytes32 auctionKey = AuctionLogic.hashAuctionPool(supplyToken, demandToken, lockHolder_, bidIndex);
        cancelBid(auctionKey, demandToken, bidIndex);
    }

    function increaseBidCmd (bytes calldata cmd) private {
        (, address supplyToken, address demandToken, uint256 bidIndex, uint128 deltaSize) =
            abi.decode(cmd, (uint8, address, address, uint256, uint128));

        bytes32 auctionKey = AuctionLogic.hashAuctionPool(supplyToken, demandToken, lockHolder_, bidIndex);
        increaseBidLedger(auctionKey, bidIndex, deltaSize);
        emit AuctionBidIncrease(auctionKey, lockHolder_, bidIndex, deltaSize);
    }

    function modifyBidLevelCmd (bytes calldata cmd) private {
        (, address supplyToken, address demandToken, uint256 bidIndex, uint16 newLevel) =
            abi.decode(cmd, (uint8, address, address, uint256, uint16));

        bytes32 auctionKey = AuctionLogic.hashAuctionPool(supplyToken, demandToken, lockHolder_, bidIndex);
        modifyBidLevelLedger(auctionKey, bidIndex, newLevel);
        emit AuctionBidLevelModify(auctionKey, lockHolder_, bidIndex, newLevel);
    }

    function refundFailedAuctionCmd (bytes calldata cmd) private {
        (, address supplyToken, address demandToken, uint256 auctionIndex) = 
            abi.decode(cmd, (uint8, address, address, uint256));

        refundFailedAuction(supplyToken, demandToken, auctionIndex);
    }
}


