// SPDX-License-Identifier: GPL-3

pragma solidity 0.8.19;
import "../CrocSwapDex.sol";
import "../libraries/AuctionLogic.sol";

/* @notice Stateless read only contract that provides functions for convienetly reading and
 *         parsing the internal state of a CrocSwapDex contract. 
 *
 * @dev Nothing in this contract can't be done by directly accessing readSlot() on the 
 *      CrocSwapDex contrct. However this provides a more convienent interface with ergonomic
 *      that parse the raw data. */
contract CrocAuctionQuery {
    using CurveMath for CurveMath.CurveState;
    using SafeCast for uint256;
    
    address immutable public dex_;

    /* @param dex The address of the CrocSwapDex contract. */    
    constructor (address dex) {
        require(dex != address(0) && CrocSwapDex(dex).acceptCrocDex(), "Invalid CrocSwapDex");
        dex_ = dex;
    }

    function queryAuctionState (address supplyToken, address demandToken, address owner, uint256 auctionIndex)
        public view returns (AuctionLogic.PricedAuctionState memory state) {
        bytes32 key = AuctionLogic.hashAuctionPool(supplyToken, demandToken, owner, auctionIndex);
        bytes32 slot = keccak256(abi.encode(key, CrocSlots.AUCTION_STATE_MAP_SLOT));

        state.clearingLevel_ = uint16(CrocSwapDex(dex_).readSlot(uint256(slot)));
        state.hasRefunded_ = CrocSwapDex(dex_).readSlot(uint256(slot)+1) != 0; 
        state.cumLiftingBids_ = uint128(CrocSwapDex(dex_).readSlot(uint256(slot)+2));
    }

    function queryAuctionPrice (address supplyToken, address demandToken, address owner, uint256 auctionIndex)
        public view returns (uint128 price) {
        AuctionLogic.PricedAuctionState memory state = queryAuctionState(supplyToken, demandToken, owner, auctionIndex);
        return AuctionLogic.getPriceForLevel(state.clearingLevel_).toUint128();
    }
}