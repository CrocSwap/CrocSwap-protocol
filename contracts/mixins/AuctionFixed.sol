// SPDX-License-Identifier: GPL-3
pragma solidity 0.8.19;

import './StorageLayout.sol';
import './SettleLayer.sol';
import '../libraries/AuctionLogic.sol';

/* @title Fixed Price Auction Mixin
 * @notice Mixin contract that implements the fixed price auction mechanism. */
contract AuctionFixed is StorageLayout, SettleLayer {
    using SafeCast for uint256;

    event AuctionHash (address indexed supplyToken, address indexed demandToken, 
        uint256 indexed auctionIndex, bytes32 auctionKey);
    event AuctionInitialized (bytes32 indexed key, uint32 auctionEndTime, uint128 auctionSupply, uint16 startLevel);
    event AuctionBid (bytes32 indexed auctionKey, address indexed bidder, uint256 indexed bidIndex, 
        uint128 bidSize, uint16 limitLevel);
    event AuctionBidRemoved (bytes32 indexed auctionKey, address indexed bidder, uint256 indexed bidIndex);
    event AuctionLevelChanged (bytes32 indexed auctionKey, uint16 oldLevel, uint16 newLevel);
    event AuctionClaimed (bytes32 indexed auctionKey, address indexed bidder, uint256 indexed bidIndex, 
        uint128 bidPaid, uint128 shares);
    event AuctionBidIncreased(bytes32 indexed auctionKey, address indexed bidder, uint256 indexed bidIndex, 
        uint128 oldSize, uint128 newSize);
    event AuctionBidModifyLevel(bytes32 indexed auctionKey, address indexed bidder, uint256 indexed bidIndex,
        uint16 oldLevel, uint16 newLevel);


    function initAuction (address supplyToken, address demandToken, uint256 auctionIndex, 
        AuctionLogic.PricedAuctionContext memory context) internal {
        require(context.auctionEndTime_ > block.timestamp, "AFI");
        
        bytes32 auctionKey = AuctionLogic.hashAuctionPool(supplyToken, demandToken, lockHolder_,auctionIndex);
        auctionContexts_[auctionKey] = context;

        auctionStates_[auctionKey].activeLevel_ = context.startLevel_;

        auctionReserves_[auctionKey] = AuctionLogic.PricedAuctionReserves({
            reserveDemand_: 0,
            reserveSupply_: context.auctionSupply_
        });

        debitTransfer(lockHolder_, context.auctionSupply_, supplyToken, popMsgVal());
        emit AuctionHash(supplyToken, demandToken, auctionIndex, auctionKey);
        emit AuctionInitialized(auctionKey, context.auctionEndTime_, context.auctionSupply_, context.startLevel_);
    }


    function placeBid (bytes32 auctionKey, address demandToken, uint256 auctionIndex, 
        uint128 bidSize, uint16 limitLevel, uint256 bidIndex) internal {
        AuctionLogic.PricedAuctionContext storage context = auctionContexts_[auctionKey];
        AuctionLogic.PricedAuctionState storage state = auctionStates_[auctionKey];

        require(auctionContexts_[auctionKey].auctionEndTime_ > block.timestamp, "AFF");
        require(limitLevel > state.activeLevel_ && limitLevel <= context.maxLevel_, "AFPL");
        
        bytes32 bidKey = AuctionLogic.hashAuctionBid(auctionKey, lockHolder_, bidIndex);

        auctionBids_[bidKey] = AuctionLogic.PricedAuctionBid({
            bidSize_: bidSize,
            limitLevel_: limitLevel,
            bidTime_: uint32(block.timestamp),
            hasClaimed_: false
        });

        state.cumLiftingBids_ += bidSize;
        auctionLevelSizes_[auctionKey][limitLevel] += bidSize;
        uint16 activeLevel = state.activeLevel_;

        while (state.cumLiftingBids_ >= AuctionLogic.getLevelCapacity(context.auctionSupply_, state.activeLevel_ + 1)) {
            state.cumLiftingBids_ -= auctionLevelSizes_[auctionKey][state.activeLevel_];
            state.activeLevel_++;
        }

        require(state.activeLevel_ < context.maxLevel_, "AFML");
        require(limitLevel >= state.activeLevel_, "AFAL");

        if (state.activeLevel_ == limitLevel) {
            uint128 filledAt = state.cumLiftingBids_ - auctionLevelSizes_[auctionKey][limitLevel];
            require(filledAt <= context.auctionSupply_, "AFOS");
        }

        AuctionLogic.PricedAuctionReserves storage reserves = auctionReserves_[auctionKey];
        reserves.reserveDemand_ += bidSize;

        debitTransfer(lockHolder_, bidSize, demandToken, popMsgVal());
        emit AuctionBid(auctionKey, lockHolder_, bidIndex, bidSize, limitLevel);
        if (state.activeLevel_ != activeLevel) {
            emit AuctionLevelChanged(auctionKey, activeLevel, state.activeLevel_);
        }
    }


    function claimBid (bytes32 auctionKey, address demandToken, uint256 bidId) internal {
        AuctionLogic.PricedAuctionContext storage context = auctionContexts_[auctionKey];
        AuctionLogic.PricedAuctionState storage state = auctionStates_[auctionKey];
        
        require(block.timestamp >= context.auctionEndTime_, "AFO");
        
        bytes32 bidKey = AuctionLogic.hashAuctionBid(auctionKey, lockHolder_, bidId);
        AuctionLogic.PricedAuctionBid storage bid = auctionBids_[bidKey];
        require(!bid.hasClaimed_ && bid.bidSize_ > 0, "AFCC");
        
        uint128 shares;
        uint128 bidRefund;
        if (bid.limitLevel_ > state.activeLevel_) {
            // Bid above clearing level gets full fill at clearing price
            shares = AuctionLogic.calcAuctionProceeds(state.activeLevel_, context.auctionSupply_, bid.bidSize_);
        } else if (bid.limitLevel_ == state.activeLevel_) {
            uint256 proRata = AuctionLogic.deriveProRataShrink(state.cumLiftingBids_, 
                auctionLevelSizes_[auctionKey][state.activeLevel_], context.auctionSupply_);
            shares = AuctionLogic.calcAuctionProceeds(state.activeLevel_, context.auctionSupply_, bid.bidSize_);
            shares = (uint256(shares) * proRata >> 64).toUint128();
            bidRefund = (uint256(bid.bidSize_) * ((1 << 64) - proRata) >> 64).toUint128();
        } else {
            bidRefund = bid.bidSize_;
        }
        
        bid.hasClaimed_ = true;
        emit AuctionClaimed(auctionKey, lockHolder_, bidId, shares, bid.bidSize_ - bidRefund);
        
        if (shares > 0) {
            creditTransfer(lockHolder_, uint128(shares), demandToken, 0);
        }
        if (bidRefund > 0) {
            creditTransfer(lockHolder_, bidRefund, demandToken, 0);
        }
    }


    function removeBid (bytes32 auctionKey, address supplyToken, uint256 bidIndex) internal {
        bytes32 bidKey = AuctionLogic.hashAuctionBid(auctionKey, lockHolder_, bidIndex);

        AuctionLogic.PricedAuctionBid storage bid = auctionBids_[bidKey];
        require(bid.hasClaimed_ == false, "AFCC");
        require(bid.limitLevel_ < auctionStates_[auctionKey].activeLevel_, "AFCA");

        uint128 bidSize = bid.bidSize_;
        delete auctionBids_[bidKey];

        auctionReserves_[auctionKey].reserveDemand_ -= bidSize;
        creditTransfer(lockHolder_, bidSize, supplyToken, 0);
        emit AuctionBidRemoved(auctionKey, lockHolder_, bidIndex);
    }

    function increaseBid (bytes32 auctionKey, address supplyToken, uint256 bidIndex, uint128 deltaSize) internal {
        bytes32 bidKey = AuctionLogic.hashAuctionBid(auctionKey, lockHolder_, bidIndex);
        AuctionLogic.PricedAuctionBid storage bid = auctionBids_[bidKey];
        require(bid.hasClaimed_ == false, "AFCC");

        AuctionLogic.PricedAuctionState storage state = auctionStates_[auctionKey];
        AuctionLogic.PricedAuctionContext storage context = auctionContexts_[auctionKey];

        // If bid is at or above active level, check capacity constraints
        if (bid.limitLevel_ >= state.activeLevel_) {
            uint256 levelCap = AuctionLogic.getLevelCapacity(context.auctionSupply_, state.activeLevel_);
            require(uint256(state.cumLiftingBids_) + deltaSize <= levelCap, "AFC");
            state.cumLiftingBids_ += deltaSize;
        }

        auctionLevelSizes_[auctionKey][bid.limitLevel_] += deltaSize;

        bid.bidSize_ += deltaSize;
        auctionReserves_[auctionKey].reserveDemand_ += deltaSize;
        debitTransfer(lockHolder_, deltaSize, supplyToken, 0);
        emit AuctionBidIncreased(auctionKey, lockHolder_, bidIndex, bid.bidSize_, deltaSize);
    }


    function modifyBidLevel (bytes32 auctionKey, uint256 bidIndex, uint16 newLimitLevel) internal {
        bytes32 bidKey = AuctionLogic.hashAuctionBid(auctionKey, lockHolder_, bidIndex);
        AuctionLogic.PricedAuctionBid storage bid = auctionBids_[bidKey];
        require(bid.hasClaimed_ == false, "AFCC");

        AuctionLogic.PricedAuctionState storage state = auctionStates_[auctionKey];
        require(newLimitLevel > state.activeLevel_, "AFCA");

        if (bid.limitLevel_ == state.activeLevel_) {
            state.cumLiftingBids_ += bid.bidSize_;
        }

        auctionLevelSizes_[auctionKey][newLimitLevel] += bid.bidSize_;
        auctionLevelSizes_[auctionKey][bid.limitLevel_] -= bid.bidSize_;


        // Set new limit level and update cumulative total if still above active
        bid.limitLevel_ = newLimitLevel;
        if (newLimitLevel >= state.activeLevel_) {
            AuctionLogic.PricedAuctionContext storage context = auctionContexts_[auctionKey];
            uint256 levelCap = AuctionLogic.getLevelCapacity(context.auctionSupply_, state.activeLevel_);
            require(uint256(state.cumLiftingBids_) + bid.bidSize_ <= levelCap, "AFC");
            state.cumLiftingBids_ += bid.bidSize_;
        }

        emit AuctionBidModifyLevel(auctionKey, lockHolder_, bidIndex, bid.limitLevel_, newLimitLevel);
    }
}
