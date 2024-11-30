
import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ZERO_ADDR } from "./FixedPoint";
import { ERC20, TestAuctionLedger, TestAuctionLogic } from "../typechain";
import { solidity } from "ethereum-waffle";
import chai from "chai";

chai.use(solidity);

describe("AuctionLedger", function() {
    let auction: TestAuctionLedger;
    let auctionLib: TestAuctionLogic;
    let owner: SignerWithAddress;
    let bidder: SignerWithAddress;
    let auctioneer: SignerWithAddress;

    const ADDR_TWO = "0x4200000000000000000000000000000000000015";

    beforeEach(async function() {
        [owner, bidder, auctioneer] = await ethers.getSigners();
        const TestAuctionLedger = await ethers.getContractFactory("TestAuctionLedger");
        auction = await TestAuctionLedger.deploy() as TestAuctionLedger;

        const TestAuctionLogic = await ethers.getContractFactory("TestAuctionLogic");
        auctionLib = await TestAuctionLogic.deploy() as TestAuctionLogic;
    });

    it("should initialize auction ledger", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );

        const lastAuctionKey = await auction.lastAuctionKey();
        const auctionKey = await auctionLib.testHashAuctionPool(ZERO_ADDR, ADDR_TWO, auctioneer.address, 0);
        expect(lastAuctionKey).to.equal(auctionKey);

        const storedContext = await auction.getAuctionContext(auctionKey);
        expect(storedContext.auctionEndTime_).to.equal(context.auctionEndTime_);
        expect(storedContext.auctionSupply_).to.equal(context.auctionSupply_);
        expect(storedContext.startLevel_).to.equal(context.startLevel_);

        const state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(context.startLevel_);
    });

    it("should place bid", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        const bidSize = 500;
        const limitLevel = 15000;
        const bidIndex = 0;

        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            bidSize,
            limitLevel,
            bidIndex
        );
        const clearingLevel = await auction.lastClearingLevel();

        const bidKey = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, bidIndex);
        const bid = await auction.getAuctionBid(bidKey);
        expect(bid.bidSize_).to.equal(bidSize);
        expect(bid.limitLevel_).to.equal(limitLevel);

        const levelSize = await auction.getLevelSize(auctionKey, limitLevel);
        expect(levelSize).to.equal(bidSize);
    });

    it("should reject duplicate bid index from same bidder", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place first bid
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            500,
            15000,
            0 // bidIndex
        );

        // Try to place bid with same index - should fail
        await expect(
            auction.connect(bidder).testPlaceBidLedger(
                auctionKey,
                600,
                16000,
                0 // Same bidIndex
            )
        ).to.be.revertedWith("AFBI");
    });

    it("should allow same bidder to place bid with different index", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place first bid
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            500,
            15000,
            0
        );

        // Place second bid with different index
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            600,
            16000,
            1 // Different bidIndex
        );

        // Verify both bids are stored
        const bidKey1 = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const bidKey2 = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 1);

        const bid1 = await auction.getAuctionBid(bidKey1);
        const bid2 = await auction.getAuctionBid(bidKey2);

        expect(bid1.bidSize_).to.equal(500);
        expect(bid1.limitLevel_).to.equal(15000);
        expect(bid2.bidSize_).to.equal(600);
        expect(bid2.limitLevel_).to.equal(16000);
    });

    it("should allow different bidders to use same bid index", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // First bidder places bid
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            500,
            15000,
            0 // Same bidIndex
        );

        // Second bidder places bid with same index
        await auction.connect(auctioneer).testPlaceBidLedger(
            auctionKey,
            700,
            17000,
            0 // Same bidIndex
        );

        // Verify both bids are stored separately
        const bidKey1 = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const bidKey2 = await auctionLib.testHashAuctionBid(auctionKey, auctioneer.address, 0);

        const bid1 = await auction.getAuctionBid(bidKey1);
        const bid2 = await auction.getAuctionBid(bidKey2);

        expect(bid1.bidSize_).to.equal(500);
        expect(bid1.limitLevel_).to.equal(15000);
        expect(bid2.bidSize_).to.equal(700);
        expect(bid2.limitLevel_).to.equal(17000);
    });

    it("should allow multiple bids at same level without level change", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR, 
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // First bid at level 150
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            300,
            15000,
            0
        );

        const state1 = await auction.getAuctionState(auctionKey);

        // Second bid at same level
        await auction.connect(auctioneer).testPlaceBidLedger(
            auctionKey,
            200,
            15000, 
            1
        );

        // Verify state hasn't changed
        const state2 = await auction.getAuctionState(auctionKey);
        expect(state2.clearingLevel_).to.equal(1760); // Still at start level
        expect(state2.cumLiftingBids_).to.equal(500); // Sum of both bids

        // Verify both bids stored correctly
        const bidKey1 = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const bidKey2 = await auctionLib.testHashAuctionBid(auctionKey, auctioneer.address, 1);

        const bid1 = await auction.getAuctionBid(bidKey1);
        const bid2 = await auction.getAuctionBid(bidKey2);

        expect(bid1.bidSize_).to.equal(300);
        expect(bid1.limitLevel_).to.equal(15000);
        expect(bid2.bidSize_).to.equal(200);
        expect(bid2.limitLevel_).to.equal(15000);
    });

    it("bid pushes to level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // First bid at level 110 that fills most of the level capacity
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000, // Just under the 1000 supply
            11000,
            0
        );

        let state = await auction.getAuctionState(auctionKey);

        expect(state.clearingLevel_).to.equal(1680);
        expect(state.cumLiftingBids_).to.equal(100000);

        let mcapLower = await auctionLib.testGetMcapForLevel(state.clearingLevel_ , context.auctionSupply_);
        let mcapUpper = await auctionLib.testGetMcapForLevel(state.clearingLevel_ + 10, context.auctionSupply_);
        expect(mcapUpper).to.gte(100000);
        expect(mcapLower).to.lte(100000);
    });

    it("second bid pushes to level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000, // Just under the 1000 supply
            11000,
            0
        );

        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            200000, // Just under the 1000 supply
            11000,
            1
        );

        let state = await auction.getAuctionState(auctionKey);

        expect(state.clearingLevel_).to.equal(1730);
        expect(state.cumLiftingBids_).to.equal(300000);

        let mcapLower = await auctionLib.testGetMcapForLevel(state.clearingLevel_ , context.auctionSupply_);
        let mcapUpper = await auctionLib.testGetMcapForLevel(state.clearingLevel_ + 10, context.auctionSupply_);
        expect(mcapUpper).to.gte(300000);
        expect(mcapLower).to.lte(300000);
    });
    
    it("bid pushes to one level over", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // First bid at level 110 that fills most of the level capacity
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000, // Just under the 1000 supply
            1690,
            0
        );

        let state = await auction.getAuctionState(auctionKey);

        expect(state.clearingLevel_).to.equal(1680);
        expect(state.cumLiftingBids_).to.equal(100000);

        let mcapLower = await auctionLib.testGetMcapForLevel(state.clearingLevel_ , context.auctionSupply_);
        let mcapUpper = await auctionLib.testGetMcapForLevel(state.clearingLevel_ + 10, context.auctionSupply_);
        expect(mcapUpper).to.gte(100000);
        expect(mcapLower).to.lte(100000);
    });

    it("bid pushes to level overflow", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Will push to level 1680 with all in lifting bids
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            2000,
            0
        );

        // 1690 is the open level but this will overflow that level
        await expect(auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1690,
            2
        )).to.be.revertedWith("AFOS");
    });

    it("should reject bids with invalid limit levels", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place first bid to move active level up
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1690, // Valid level
            0
        );

        // Try to place bid with level not divisible by step size
        await expect(
            auction.connect(bidder).testPlaceBidLedger(
                auctionKey,
                100,
                1695, // Not divisible by 10
                1
            )
        ).to.be.revertedWith("AFSS");

        // Try to place bid below active level
        await expect(
            auction.connect(bidder).testPlaceBidLedger(
                auctionKey,
                100,
                1680, 
                2
            )
        ).to.be.revertedWith("AFPL");

        // Try to place bid with zero size
        await expect(
            auction.connect(bidder).testPlaceBidLedger(
                auctionKey,
                0,
                1690, // Valid level
                2
            )
        ).to.be.revertedWith("AFBI");

        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            10,
            1690, // Valid level
            3
        );
    });

    it("should accept bid that exactly fills level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place first bid to move active level up
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1690, // Valid level
            0
        );

        const marketCap = await auctionLib.testGetMcapForLevel(1690, context.auctionSupply_);
        const exactFillAmount = marketCap.sub(100000).toNumber()

        // Place bid that exactly fills the level
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            exactFillAmount,
            1690, // Same level as first bid
            1
        );

        // Verify auction state
        const state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1690);
    });

    it("should handle bid that pushes clearing level above previous bid level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place first bid at level 1690
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1690,
            0
        );

        // Place large bid at higher level that pushes clearing level up
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            500000,
            3000,
            1
        );

        // Verify clearing level moved above 1690
        const state = await auction.getAuctionState(auctionKey);
        expect(state.cumLiftingBids_).to.equal(500000);
        expect(state.clearingLevel_).to.equal(1760);
    });

    it("should not allow canceling bid above clearing level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place bid above clearing level
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1690,
            0
        );

        // Attempt to cancel bid should revert
        await expect(
            auction.connect(bidder).testCancelBidLedger(
                auctionKey,
                0
            )
        ).to.be.revertedWith("AFCA");
    });

    it("should not allow canceling bid at clearing level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place first bid to move active level up
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1690,
            0
        );

        const marketCap = await auctionLib.testGetMcapForLevel(1690, context.auctionSupply_);
        const exactFillAmount = marketCap.sub(100000).toNumber();

        // Place bid that exactly fills the level
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            exactFillAmount,
            1690,
            1
        );

        // Attempt to cancel second bid should revert
        await expect(
            auction.connect(bidder).testCancelBidLedger(
                auctionKey,
                1
            )
        ).to.be.revertedWith("AFCA");
    });

    it("should allow canceling bid below clearing level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place first bid at 1690
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            10000,
            1690,
            0
        );

        // Place second bid at higher level to move clearing level up
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            500000,
            1760,
            1
        );

        // Cancel first bid which is now below clearing
        await auction.connect(bidder).testCancelBidLedger(
            auctionKey,
            0
        );

        // Get bid key for first bid
        const bidKey = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const bid = await auction.getAuctionBid(bidKey)
        expect(bid.bidSize_).to.equal(0);
        expect(bid.limitLevel_).to.equal(0);
        expect(bid.bidTime_).to.equal(0);
    });
});
