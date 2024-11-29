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
     * @param maxLevel_ The maximum price level that bids can be placed at
     * @param auctionSupply_ The total amount of supply tokens being auctioned */
    struct PricedAuctionContext {
        uint32 auctionEndTime_;
        uint16 startLevel_;
        uint16 maxLevel_;
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
     * @param bidTime_ The timestamp when the bid was placed
     * @param hasClaimed_ Whether the bid has been claimed after auction end */
    struct PricedAuctionBid {
        uint128 bidSize_;
        uint16 limitLevel_;
        uint32 bidTime_;
        bool hasClaimed_;
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

    function getLevelCapacity(uint256 totalSupply, uint16 level) public pure returns (uint256) {
        return totalSupply * getMcapForLevel(level) >> 192;
    }

    /* @notice Converts a level index to its corresponding price in X64.64 fixed point format
     * @dev Each level increases price by a factor of 1 + 2^(1/8), meaning prices double every 8 levels.
     *      The base price at level 0 is 1.0 in X64.64 format (2^64).
     *      For levels that are multiples of 8, price is a power of 2 shift.
     *      For other levels, price is interpolated using precomputed constants.
     * @param level The level index to get the price for
     * @return The market cap of the total fixed supply in X192.64 fixed point format */
    function getMcapForLevel(uint16 level) public pure returns (uint256) {
        uint256 levelFull = uint256(level);

        uint256 baseShift = levelFull >> 3;  // Divide by 8
        uint256 remainder = levelFull & 0x7;  // Mod 8
        uint256 base = 1 << baseShift;

        if (remainder == 0) {
            return base << 64;
        } else if (remainder == 1) {
            return base * (118508706     << 54);
        } else if (remainder == 2) {
            return base * (140391238     << 54);
        } else if (remainder == 3) {
            return base * (166351770     << 54);
        } else if (remainder == 4) {
            return base * (197192466     << 54);
        } else if (remainder == 5) {
            return base * (233666846     << 54);
        } else if (remainder == 6) {
            return base * (277146338     << 54);
        } else {
            return base * (328613022     << 54);
        }
    }

    /* @notice Calculates the amount of supply tokens received for a given bid size at a price level
     * @dev Converts bid size in demand tokens to supply tokens based on the level's price
     * @param level The level index that determines the price
     * @param totalSupply The total supply tokens in the auction
     * @param bidSize The size of the bid in demand tokens
     * @return The amount of supply tokens received for the bid */
    function calcAuctionProceeds(uint16 level, uint256 totalSupply, uint128 bidSize) public pure returns (uint128) {
        // Get the total market cap at this level
        uint256 mcap = getMcapForLevel(level);
        
        // Calculate price per token by dividing mcap by total supply
        // Note: mcap is in X192.64 format, so result will be in X64.64
        uint256 pricePerToken = mcap / totalSupply;
        
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
        public pure returns (uint256) {
        uint256 levelCap = totalSupply - cumBids;
        if (levelBids == 0) { return 0; }
        return (levelCap << 64) / levelBids;
    }
}
