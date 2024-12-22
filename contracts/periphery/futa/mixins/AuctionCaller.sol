// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.19;

import "./FutaBase.sol";
import "../../../CrocSwapDex.sol";
import "../../../lens/CrocQuery.sol";
import "../../../lens/CrocAuctionQuery.sol";
import "../../../libraries/AuctionLogic.sol";
import "../../../interfaces/IERC20Minimal.sol";
import "../../../libraries/TransferHelper.sol";
import "../../../libraries/ProtocolCmd.sol";

contract AuctionCaller is FutaBase {

    function setAuctionSteps(uint16 auctionStartStep, uint16 auctionStepSize) public protocolOnly(false) {
        auctionStepSize_ = auctionStepSize;
        auctionStartStep_ = auctionStartStep;
    }

    function setAuctionDuration(uint32 auctionDuration) public protocolOnly(false) {
        auctionDuration_ = auctionDuration;
    }

    uint16 constant AUCTION_INDEX = 42069;
    uint16 constant CREATOR_BID_INDEX = 42002;

    function initiateAuctionETH (address token, uint256 auctionSupply) internal {
        require(auctionCreators_[token] == address(0), "Auction exists");
        require(auctionDuration_ > 0, "Auction duration unset");
        require(auctionStepSize_ > 0 && auctionStartStep_ > 0, "Auction step unset");
        require(auctionSupply_ > 0, "Auction supply unset");

        auctionCreators_[token] = lockHolder_;

        uint256 endTime = block.timestamp + auctionDuration_;
        bytes memory callCmd = abi.encode(UserCmd.INIT_AUCTION, token, address(0), AUCTION_INDEX, 
            endTime, auctionSupply, auctionStepSize_, auctionStartStep_);

        CrocSwapDex(auctionDex_).userCmd(CrocSlots.AUCTION_PROXY_PATH, callCmd);
    }

    function refundAuctionETH (address tickerToken) internal returns (uint128 auctionPrice) {
        uint256 startBal = address(this).balance;
        bytes memory callCmd = abi.encode(UserCmd.REFUND_AUCTION, tickerToken, address(0), AUCTION_INDEX);
        CrocSwapDex(auctionDex_).userCmd(CrocSlots.AUCTION_PROXY_PATH, callCmd);

        uint256 endBal = address(this).balance;
        uint256 auctionProceeds = endBal - startBal;

        divideAuctionProceeds(auctionProceeds, auctionCreators_[tickerToken]);

        auctionPrice = CrocAuctionQuery(crocAuctionQuery_).queryAuctionPrice
            (tickerToken, address(0), address(this), AUCTION_INDEX);
    }

    function divideAuctionProceeds(uint256 auctionProceeds, address creator) internal returns (uint256 netReceived) {
        uint256 protocolCut = auctionProceeds * protocolFee_ / 1_000_000;
        uint256 creatorCut = (auctionProceeds - protocolCut) * creatorFee_ / 1_000_000;

        TransferHelper.safeEtherSend(authority_, protocolCut);
        TransferHelper.safeEtherSend(creator, creatorCut);

        return auctionProceeds - protocolCut - creatorCut;
    }

    function lockCreatorBid(address token) internal {
        uint128 minBidSize = AuctionLogic.getMcapForLevel(auctionStartStep_, auctionSupply_); 
        bytes32 auctionKey = AuctionLogic.hashAuctionPool(token, address(0), address(this), AUCTION_INDEX);

        uint256 ethVal = popMsgVal();
        require(ethVal > minBidSize, "Creator bid too small");

        uint16 MAX_LIMIT_LEVEL = type(uint16).max;

        bytes memory callCmd = abi.encode(UserCmd.PLACE_BID, auctionKey, address(0), ethVal, 
            MAX_LIMIT_LEVEL, CREATOR_BID_INDEX);
        CrocSwapDex(auctionDex_).userCmd{value: ethVal}(CrocSlots.AUCTION_PROXY_PATH, callCmd);
    }

    function claimCreatorBid(address token) internal {
        uint256 startBal = IERC20Minimal(token).balanceOf(address(this));

        bytes memory callCmd = abi.encode(UserCmd.CLAIM_BID, token, address(0), AUCTION_INDEX, CREATOR_BID_INDEX);
        CrocSwapDex(auctionDex_).userCmd(CrocSlots.AUCTION_PROXY_PATH, callCmd);

        uint256 endBal = IERC20Minimal(token).balanceOf(address(this));
        
        address creator = auctionCreators_[token];
        TransferHelper.safeTransfer(creator, msg.sender, endBal - startBal);
    }
}