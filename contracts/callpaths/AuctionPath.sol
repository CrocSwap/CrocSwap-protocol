// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;

import '../mixins/AuctionHouse.sol';
import '../libraries/ProtocolCmd.sol';

contract AuctionPath is AuctionHouse {

    function userCmd (bytes calldata cmd) external payable {
        uint8 code = uint8(cmd[0]);

        if (code == UserCmd.INIT_AUCTION) {
            initAuctionCmd(cmd);
        } else if (code == UserCmd.PLACE_BID) {
            placeBidCmd(cmd);
        } else if (code == UserCmd.CLAIM_BID) {
            claimBidCmd(cmd);
        } else if (code == UserCmd.CANCEL_BID) {
            cancelBidCmd(cmd);
        } else if (code == UserCmd.INCREASE_BID) {
            increaseBidCmd(cmd);
        } else if (code == UserCmd.MODIFY_BID) {
            modifyBidLevelCmd(cmd);
        } else if (code == UserCmd.MODIFY_AND_INCREASE_BID) {
            modifyAndIncreaseBidCmd(cmd);
        } else if (code == UserCmd.REFUND_AUCTION) {
            refundAuctionCmd(cmd);
        } else {
            revert("Invalid code");
        }
    }

    function protocolCmd (bytes calldata cmd) private {
        uint8 code = uint8(cmd[0]);
        if (code == 95) {
            setAuctionProtocolFeeCmd(cmd);
        } else {
            revert("Invalid code");
        }
    }

    function setAuctionProtocolFeeCmd (bytes calldata cmd) private {
        (, uint16 protocolFee) = abi.decode(cmd, (uint8, uint16));
        auctionProtocolFee_ = protocolFee;
    }

    function initAuctionCmd (bytes calldata cmd) private {
        (, address supplyToken, address demandToken, uint256 auctionIndex,
            uint32 auctionEndTime, uint128 auctionSupply, uint16 startLevel, uint16 stepSize) = 
            abi.decode(cmd, (uint8, address, address, uint256, uint32, uint128, uint16, uint16));

        AuctionLogic.PricedAuctionContext memory context = AuctionLogic.PricedAuctionContext({
            auctionEndTime_: auctionEndTime,
            auctionSupply_: auctionSupply,
            startLevel_: startLevel,
            stepSize_: stepSize,
            protocolFee_: auctionProtocolFee_
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

    function modifyAndIncreaseBidCmd (bytes calldata cmd) private {
        (, address supplyToken, address demandToken, uint256 bidIndex, uint16 newLevel, uint128 deltaSize) =
            abi.decode(cmd, (uint8, address, address, uint256, uint16, uint128));

        bytes32 auctionKey = AuctionLogic.hashAuctionPool(supplyToken, demandToken, lockHolder_, bidIndex);
        modifyBidLevelLedger(auctionKey, bidIndex, newLevel);
        increaseBidLedger(auctionKey, bidIndex, deltaSize);
    }

    function refundAuctionCmd (bytes calldata cmd) private {
        (, address supplyToken, address demandToken, uint256 auctionIndex) = 
            abi.decode(cmd, (uint8, address, address, uint256));

        refundAuction(supplyToken, demandToken, auctionIndex);
    }

    /* @notice Used at upgrade time to verify that the contract is a valid Croc sidecar proxy and used
     *         in the correct slot. */
    function acceptCrocProxyRole (address, uint16 slot) public pure returns (bool) {
        return slot == CrocSlots.AUCTION_PROXY_PATH;
    }
}


