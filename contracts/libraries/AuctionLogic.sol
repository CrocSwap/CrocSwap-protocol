// SPDX-License-Identifier: GPL-3
pragma solidity 0.8.19;

import "./SafeCast.sol";

/* @title AuctionLogic Library
 * @dev Contains functions and data structures for managing single price fixed time auctions */
library AuctionLogic {
    using SafeCast for uint256;

    /* @notice Stores the immutable parameters that define an auction
     * @param auctionEndTime_ The timestamp when the auction ends and bids can be claimed
     * @param startLevel_ The initial price level where the auction begins
     * @param auctionSupply_ The total amount of supply tokens being auctioned */
    struct PricedAuctionContext {
        uint32 auctionEndTime_;
        uint16 startLevel_;
        uint16 stepSize_;
        uint128 auctionSupply_;
    }

    /* @notice Tracks the current state of an active auction
     * @param activeLevel_ The current clearing price level of the auction
     * @param cumLiftingBids_ The total size of all active bids *above* the active level */
    struct PricedAuctionState {
        uint16 activeLevel_;
        uint128 cumLiftingBids_;
    }

    /* @notice Tracks the token reserves locked in an auction
     * @param reserveDemand_ The total amount of demand tokens locked in bids
     * @param reserveSupply_ The remaining supply tokens available to fill bids */
    struct PricedAuctionReserves {
        uint128 reserveDemand_;
        uint128 reserveSupply_;
    }

    /* @notice Represents a single bid in the auction
     * @param bidSize_ The size of the bid in demand tokens
     * @param limitLevel_ The maximum price level the bid is willing to pay
     * @param bidTime_ The timestamp when the bid was placed */
    struct PricedAuctionBid {
        uint128 bidSize_;
        uint16 limitLevel_;
        uint32 bidTime_;
    }

    /* @notice Calculates a unique hash key for an auction pool's storage data
     * @dev Used to map auction-specific data in StorageLayout mappings like auctionContexts_, auctionStates_, etc.
     * @param supplyToken The token being auctioned (supplied)
     * @param demandToken The token being bid with (demanded)
     * @param auctioneer The address running the auction
     * @param auctionSalt A unique salt value to allow multiple auctions by the same auctioneer for the same token pair
     * @return A bytes32 hash key for accessing auction storage data */
    function hashAuctionPool (address supplyToken, address demandToken, address auctioneer, uint256 auctionSalt) 
        internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(supplyToken, demandToken, auctioneer, auctionSalt));
    }

    /* @notice Calculates a unique hash key for a specific bid's storage data
     * @dev Used to map bid-specific data in StorageLayout mappings like auctionBids_
     * @param auctionKey The hash key of the auction this bid belongs to
     * @param bidder The address placing the bid
     * @param bidSalt A unique salt value to allow multiple bids by the same bidder in the same auction
     * @return A bytes32 hash key for accessing bid storage data */
    function hashAuctionBid (bytes32 auctionKey, address bidder, uint256 bidSalt) 
        internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(auctionKey, bidder, bidSalt));
    }

    /* @notice Converts a level index to its corresponding price in X64.64 fixed point format
     * @dev Each level increases price by a factor of approximately 1 + 2^(1/32), meaning prices double every 32 levels.
     *      The base price at level 0 is 2^-16 in X64.64 format (2^48).
     *      For levels that are multiples of 32, price is a power of 2 shift.
     *      For other levels within a 32-step window, price is linearly interpolated using (1 + N/32).
     * @param level The level index to get the price for
     * @return The price per token in X64.64 fixed point format */
    function getPriceForLevel(uint16 level) internal pure returns (uint256) {
        uint16 baseShift = level >> 5;  // Divide by 32
        uint16 remainder = level & 0x1f;  // Mod 32

        uint256 x64One = 1 << 64;
        uint256 minPrice = 1 << 8;
        uint256 base = minPrice << baseShift;

        require(base > 0 && base < (1 << 191));

        uint256 remainderStep = 3125 * x64One / 100000;         
        return base * (x64One + remainder * remainderStep) >> 64;
    }
    /* @notice Calculates the total market cap at a given level
     * @dev Multiplies the price per token at the level by the total supply
     * @param level The level index to calculate market cap for
     * @param totalSupply The total supply of tokens
     * @return The total market cap in X64.64 fixed point format */
    function getMcapForLevel(uint16 level, uint256 totalSupply) internal pure returns (uint128) {
        uint256 pricePerToken = getPriceForLevel(level);
        return (pricePerToken * totalSupply).toUint128();
    }

    /* @notice Calculates the amount of supply tokens received for a given bid size at a price level
     * @dev Converts bid size in demand tokens to supply tokens based on the level's price
     * @param level The level index that determines the price
     * @param bidSize The size of the bid in demand tokens
     * @return The amount of supply tokens received for the bid */
    function calcAuctionProceeds(uint16 level, uint128 bidSize) 
        internal pure returns (uint128) {
        // Get the total market cap at this level
        uint256 pricePerToken = getPriceForLevel(level);       
        
        // Calculate tokens received by dividing bid size by price per token
        // Note: bidSize is raw value, pricePerToken is X64.64, so shift left by 64 first
        return ((uint256(bidSize) << 64) / pricePerToken).toUint128();
    }

    /* @notice Calculates the pro-rata shrink factor for bids at the clearing level
     * @dev When the auction clears at a level with partial fill, bids at that level
     *      need to be scaled down proportionally. This function calculates that scale
     *      factor in X64.64 fixed point format.
     * @param cumBids The cumulative size of all bids at levels above the clearing level
     * @param levelBids The total size of all bids at the clearing level
     * @param totalSupply The total supply tokens in the auction
     * @return The pro-rata shrink factor in X64.64 fixed point format */
    function deriveProRataShrink(uint256 cumBids, uint256 levelBids, uint256 totalSupply) 
        internal pure returns (uint256) {
        uint256 levelCap = totalSupply - cumBids;
        if (levelBids == 0) { return 1 << 64; }
        if (levelCap > levelBids) { return 1 << 64; }
        return (levelCap << 64) / levelBids;
    }

    /* @notice Calculates the bid refund and shares for a bid at the clearing level
     * @dev When the auction clears at a level with partial fill, bids at that level
     *      need to be scaled down proportionally. This function calculates both the
     *      shares received and demand tokens refunded.
     * @param level The clearing level
     * @param bidSize The size of the bid in demand tokens
     * @param cumBids The cumulative size of all bids at levels above the clearing level
     * @param levelBids The total size of all bids at the clearing level
     * @return shares The amount of supply tokens received
     * @return bidRefund The amount of demand tokens refunded */
    function calcClearingLevelShares(uint16 level, uint128 bidSize, uint256 proRata)
        internal pure returns (uint128 shares, uint128 bidRefund) {
        shares = calcAuctionProceeds(level, bidSize);
        shares = (uint256(shares) * proRata >> 64).toUint128();
        bidRefund = (uint256(bidSize) * ((1 << 64) - proRata) >> 64).toUint128();
        return (shares, bidRefund);
    }
}
