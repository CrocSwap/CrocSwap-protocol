// SPDX-License-Identifier: GPL-3
pragma solidity 0.8.19;

import './StorageLayout.sol';
import './SettleLayer.sol';
import '../libraries/AuctionLogic.sol';

/* @title Fixed Price Auction Mixin
 * @notice Mixin contract that implements the fixed price auction mechanism. */
contract AuctionLedger is StorageLayout {
    using SafeCast for uint256;

    function initAuctionLedger (address supplyToken, address demandToken, uint256 auctionIndex, 
        AuctionLogic.PricedAuctionContext memory context) internal returns (bytes32 auctionKey) {
        auctionKey = AuctionLogic.hashAuctionPool(supplyToken, demandToken, lockHolder_, auctionIndex);
        auctionContexts_[auctionKey] = context;
        auctionStates_[auctionKey].activeLevel_ = context.startLevel_;

    }

    function placeBidLedger (bytes32 auctionKey, uint128 bidSize, uint16 limitLevel, uint256 bidIndex) 
        internal returns (uint16 clearingLevel) {
        bytes32 bidKey = AuctionLogic.hashAuctionBid(auctionKey, lockHolder_, bidIndex);
        recordBid(auctionKey, bidKey, bidSize, limitLevel);
        return updateAuctionLevel(auctionKey, limitLevel);
    }

    function recordBid(bytes32 auctionKey, bytes32 bidKey, uint128 bidSize, uint16 limitLevel) private {
        AuctionLogic.PricedAuctionState storage state = auctionStates_[auctionKey];
        AuctionLogic.PricedAuctionContext storage context = auctionContexts_[auctionKey];
        require(limitLevel > state.activeLevel_, "AFPL");
        require(auctionBids_[bidKey].bidSize_ == 0, "AFBI");
        require(limitLevel % context.stepSize_ == 0, "AFSS");

        auctionBids_[bidKey] = AuctionLogic.PricedAuctionBid({
            bidSize_: bidSize,
            limitLevel_: limitLevel,
            bidTime_: uint32(block.timestamp)
        });

        auctionStates_[auctionKey].cumLiftingBids_ += bidSize;
        auctionLevelSizes_[auctionKey][limitLevel] += bidSize;
    }

    function updateAuctionLevel(bytes32 auctionKey, uint16 bidLevel) private returns (uint16 clearingLevel) {
        AuctionLogic.PricedAuctionContext storage context = auctionContexts_[auctionKey];
        AuctionLogic.PricedAuctionState storage state = auctionStates_[auctionKey];

        while (state.cumLiftingBids_ >= AuctionLogic.getLevelCapacity(context.auctionSupply_, state.activeLevel_ + 1)) {
            state.cumLiftingBids_ -= auctionLevelSizes_[auctionKey][state.activeLevel_];
            state.activeLevel_ += context.stepSize_;
        }

        if (auctionStates_[auctionKey].activeLevel_ == bidLevel) {
            uint128 filledAt = state.cumLiftingBids_ - auctionLevelSizes_[auctionKey][bidLevel];
            require(filledAt <= context.auctionSupply_, "AFOS");
        }

        require(bidLevel >= state.activeLevel_, "AFAL");
        return state.activeLevel_;
    }


    function claimBidLedger (bytes32 auctionKey, uint256 bidId) internal 
        returns (uint128 shares, uint128 bidRefund) {
        AuctionLogic.PricedAuctionContext storage context = auctionContexts_[auctionKey];
        AuctionLogic.PricedAuctionState storage state = auctionStates_[auctionKey];

        bytes32 bidKey = AuctionLogic.hashAuctionBid(auctionKey, lockHolder_, bidId);

        // Auction failed to fill, return full bid
        if (state.activeLevel_ <= context.startLevel_) {
            bidRefund = auctionBids_[bidKey].bidSize_;
            shares = 0;
            delete auctionBids_[bidKey];
            return (shares, bidRefund);
        }

        AuctionLogic.PricedAuctionBid storage bid = auctionBids_[bidKey];
        require(bid.bidSize_ > 0, "AFCC");
        
        (shares, bidRefund) = deriveFillShare(state, bid, context.auctionSupply_, auctionLevelSizes_[auctionKey][state.activeLevel_]);
        delete auctionBids_[bidKey];
    }

    function deriveFillShare(AuctionLogic.PricedAuctionState memory state, AuctionLogic.PricedAuctionBid memory bid, 
        uint128 totalSupply, uint128 levelBids) internal pure returns (uint128 shares, uint128 bidRefund) {
        if (bid.limitLevel_ > state.activeLevel_) {
            shares = AuctionLogic.calcAuctionProceeds(state.activeLevel_, totalSupply, bid.bidSize_);
        } else if (bid.limitLevel_ == state.activeLevel_) {
            uint proRata = AuctionLogic.deriveProRataShrink(state.cumLiftingBids_, levelBids, totalSupply);
            (shares, bidRefund) = AuctionLogic.calcClearingLevelShares(state.activeLevel_, totalSupply, bid.bidSize_, proRata);
        } else {
            bidRefund = bid.bidSize_;
        }
    }


    function refundFailedLedger (address supplyToken, address demandToken, uint256 auctionSalt) 
        internal view returns (bytes32 auctionKey, uint128 supplyReturn) {
        auctionKey = AuctionLogic.hashAuctionPool(supplyToken, demandToken, lockHolder_, auctionSalt);
        AuctionLogic.PricedAuctionContext storage context = auctionContexts_[auctionKey];
        AuctionLogic.PricedAuctionState storage state = auctionStates_[auctionKey];

        require(state.activeLevel_ <= context.startLevel_, "AFNF");
        supplyReturn = context.auctionSupply_;
    }


    function cancelBidLedger (bytes32 auctionKey, uint256 bidIndex) internal returns (uint128 bidSize) {
        bytes32 bidKey = AuctionLogic.hashAuctionBid(auctionKey, lockHolder_, bidIndex);

        AuctionLogic.PricedAuctionBid storage bid = auctionBids_[bidKey];
        require(bid.limitLevel_ < auctionStates_[auctionKey].activeLevel_, "AFCA");

        bidSize = bid.bidSize_;
        delete auctionBids_[bidKey];
    }


    function increaseBidLedger (bytes32 auctionKey, uint256 bidIndex, uint128 deltaSize) internal {
        bytes32 bidKey = AuctionLogic.hashAuctionBid(auctionKey, lockHolder_, bidIndex);
        AuctionLogic.PricedAuctionBid storage bid = auctionBids_[bidKey];
        AuctionLogic.PricedAuctionState storage state = auctionStates_[auctionKey];

        require(bid.limitLevel_ > state.activeLevel_, "AFCA");

        state.cumLiftingBids_ += deltaSize;
        auctionLevelSizes_[auctionKey][bid.limitLevel_] += deltaSize;
        updateAuctionLevel(auctionKey, bid.limitLevel_);
    }


    function modifyBidLevelLedger (bytes32 auctionKey, uint256 bidIndex, uint16 newLimitLevel) internal {
        bytes32 bidKey = AuctionLogic.hashAuctionBid(auctionKey, lockHolder_, bidIndex);
        AuctionLogic.PricedAuctionBid storage bid = auctionBids_[bidKey];
        AuctionLogic.PricedAuctionState storage state = auctionStates_[auctionKey];
        AuctionLogic.PricedAuctionContext storage context = auctionContexts_[auctionKey];

        require(newLimitLevel > state.activeLevel_, "AFCA");
        require(newLimitLevel % context.stepSize_ == 0, "AFSS");

        if (bid.limitLevel_ == state.activeLevel_) {
            state.cumLiftingBids_ += bid.bidSize_;
        }

        auctionLevelSizes_[auctionKey][newLimitLevel] += bid.bidSize_;
        auctionLevelSizes_[auctionKey][bid.limitLevel_] -= bid.bidSize_;
        updateAuctionLevel(auctionKey, newLimitLevel);
    }
}



contract AuctionHouse is AuctionLedger, SettleLayer {

    event AuctionHash (address indexed supplyToken, address indexed demandToken, 
        uint256 indexed auctionIndex, bytes32 auctionKey);
    event AuctionInit (bytes32 indexed key, uint32 auctionEndTime, uint128 auctionSupply, uint16 startLevel);
    event AuctionBid (bytes32 indexed auctionKey, address indexed bidder, uint256 indexed bidIndex, 
        uint128 bidSize, uint16 limitLevel, uint16 clearingLevel);
    event AuctionBidRemove (bytes32 indexed auctionKey, address indexed bidder, uint256 indexed bidIndex);
    event AuctionLevelChange (bytes32 indexed auctionKey, uint16 newLevel);
    event AuctionClaim (bytes32 indexed auctionKey, address indexed bidder, uint256 indexed bidIndex, 
        uint128 bidPaid, uint128 shares);
    event AuctionBidIncrease(bytes32 indexed auctionKey, address indexed bidder, uint256 indexed bidIndex, 
        uint128 deltaSize);
    event AuctionBidLevelModify(bytes32 indexed auctionKey, address indexed bidder, uint256 indexed bidIndex,
        uint16 newLevel);
    event AuctionRefund (bytes32 indexed auctionKey, address indexed auctioneer, uint128 supplyReturn);


    function initAuction (address supplyToken, address demandToken, uint256 auctionIndex, 
        AuctionLogic.PricedAuctionContext memory context) internal {
        require(context.auctionEndTime_ > block.timestamp, "AFI");

        bytes32 auctionKey = initAuctionLedger(supplyToken, demandToken, auctionIndex, context);
        requireAuctionOpen(auctionKey);
        collectSupply(auctionKey, supplyToken, context.auctionSupply_);

        emit AuctionHash(supplyToken, demandToken, auctionIndex, auctionKey);
        emit AuctionInit(auctionKey, context.auctionEndTime_, context.auctionSupply_, context.startLevel_);
    }

    function placeBid (bytes32 auctionKey, address demandToken, 
        uint128 bidSize, uint16 limitLevel, uint256 bidIndex) internal {
        requireAuctionOpen(auctionKey);
        uint16 clearingLevel = placeBidLedger(auctionKey, bidSize, limitLevel, bidIndex);
        collectDemand(auctionKey, demandToken, bidSize);
        emit AuctionBid(auctionKey, lockHolder_, bidIndex, bidSize, limitLevel, clearingLevel);
    }

    function claimBid (bytes32 auctionKey, address demandToken, address supplyToken, uint256 bidId) internal {
        requireAuctionClosed(auctionKey);
        (uint128 supplyPaid, uint128 demandPaid) = claimBidLedger(auctionKey, bidId);
        payoutDemand(auctionKey, demandToken, demandPaid);
        payoutSupply(auctionKey, supplyToken, supplyPaid);
        emit AuctionClaim(auctionKey, lockHolder_, bidId, supplyPaid, demandPaid);
    }

    function refundFailedAuction (address supplyToken, address demandToken, uint256 auctionIndex) internal {
        (bytes32 auctionKey, uint128 refunded) = refundFailedLedger(supplyToken, demandToken, auctionIndex);
        requireAuctionClosed(auctionKey);
        payoutSupply(auctionKey, supplyToken, refunded);
        emit AuctionRefund(auctionKey, lockHolder_, refunded);
    }

    function cancelBid (bytes32 auctionKey, address demandToken, uint256 bidIndex) internal {
        requireAuctionOpen(auctionKey);
        uint128 bidSize = cancelBidLedger(auctionKey, bidIndex);
        payoutDemand(auctionKey, demandToken, bidSize);
        emit AuctionBidRemove(auctionKey, lockHolder_, bidIndex);
    }

    function increaseBid (bytes32 auctionKey, address demandToken, uint256 bidIndex, uint128 deltaSize) internal {
        requireAuctionOpen(auctionKey);
        increaseBidLedger(auctionKey, bidIndex, deltaSize);
        collectDemand(auctionKey, demandToken, deltaSize);
        emit AuctionBidIncrease(auctionKey, lockHolder_, bidIndex, deltaSize);
    }

    function modifyBidLevel (bytes32 auctionKey, uint256 bidIndex, uint16 newLimitLevel) internal {
        requireAuctionOpen(auctionKey);
        modifyBidLevelLedger(auctionKey, bidIndex,  newLimitLevel);
        emit AuctionBidLevelModify(auctionKey, lockHolder_, bidIndex, newLimitLevel);
    }

    function requireAuctionOpen (bytes32 auctionKey) private view {
        require(block.timestamp < auctionContexts_[auctionKey].auctionEndTime_, "AFO");
    }

    function requireAuctionClosed (bytes32 auctionKey) private view {
        require(block.timestamp >= auctionContexts_[auctionKey].auctionEndTime_, "AFC");
    }

    function collectSupply (bytes32 auctionKey, address supplyToken, uint128 amount) private {
        auctionReserves_[auctionKey].reserveSupply_ += amount;
        debitTransfer(lockHolder_, amount, supplyToken, popMsgVal());
    }

    function collectDemand (bytes32 auctionKey, address demandToken, uint128 amount) private {
        auctionReserves_[auctionKey].reserveDemand_ += amount;
        creditTransfer(lockHolder_, amount, demandToken, 0);
    }

    function payoutSupply (bytes32 auctionKey, address supplyToken, uint128 amount) private {
        auctionReserves_[auctionKey].reserveSupply_ -= amount;
        creditTransfer(lockHolder_, amount, supplyToken, 0);
    }

    function payoutDemand (bytes32 auctionKey, address demandToken, uint128 amount) private {
        auctionReserves_[auctionKey].reserveDemand_ -= amount;
        debitTransfer(lockHolder_, amount, demandToken, 0);
    }
}