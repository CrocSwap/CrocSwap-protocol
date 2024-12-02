
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
            stepSize_: 10,
            protocolFee_: 100
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
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        const bidSize = 500;
        const limitLevel = 4000;
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
            stepSize_: 10,
            protocolFee_: 100
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
            4000,
            0 // bidIndex
        );

        // Try to place bid with same index - should fail
        await expect(
            auction.connect(bidder).testPlaceBidLedger(
                auctionKey,
                600,
                4000,
                0 // Same bidIndex
            )
        ).to.be.revertedWith("AFBI");
    });

    it("should allow same bidder to place bid with different index", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
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
            4000,
            0
        );

        // Place second bid with different index
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            600,
            3000,
            1 // Different bidIndex
        );

        // Verify both bids are stored
        const bidKey1 = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const bidKey2 = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 1);

        const bid1 = await auction.getAuctionBid(bidKey1);
        const bid2 = await auction.getAuctionBid(bidKey2);

        expect(bid1.bidSize_).to.equal(500);
        expect(bid1.limitLevel_).to.equal(4000);
        expect(bid2.bidSize_).to.equal(600);
        expect(bid2.limitLevel_).to.equal(3000);
    });

    it("should allow different bidders to use same bid index", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
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
            4000,
            0 // Same bidIndex
        );

        // Second bidder places bid with same index
        await auction.connect(auctioneer).testPlaceBidLedger(
            auctionKey,
            700,
            3900,
            0 // Same bidIndex
        );

        // Verify both bids are stored separately
        const bidKey1 = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const bidKey2 = await auctionLib.testHashAuctionBid(auctionKey, auctioneer.address, 0);

        const bid1 = await auction.getAuctionBid(bidKey1);
        const bid2 = await auction.getAuctionBid(bidKey2);

        expect(bid1.bidSize_).to.equal(500);
        expect(bid1.limitLevel_).to.equal(4000);
        expect(bid2.bidSize_).to.equal(700);
        expect(bid2.limitLevel_).to.equal(3900);
    });

    it("should allow multiple bids at same level without level change", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
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
            4000,
            0
        );

        const state1 = await auction.getAuctionState(auctionKey);

        // Second bid at same level
        await auction.connect(auctioneer).testPlaceBidLedger(
            auctionKey,
            200,
            4000, 
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
        expect(bid1.limitLevel_).to.equal(4000);
        expect(bid2.bidSize_).to.equal(200);
        expect(bid2.limitLevel_).to.equal(4000);
    });

    it("bid pushes to level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
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
            4000,
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
            stepSize_: 10,
            protocolFee_: 100
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
            4000,
            0
        );

        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            200000, // Just under the 1000 supply
            4000,
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
            stepSize_: 10,
            protocolFee_: 100
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
            stepSize_: 10,
            protocolFee_: 100
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
            stepSize_: 10,
            protocolFee_: 100
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
            stepSize_: 10,
            protocolFee_: 100
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
            stepSize_: 10,
            protocolFee_: 100
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
            stepSize_: 10,
            protocolFee_: 100
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
            stepSize_: 10,
            protocolFee_: 100

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
            stepSize_: 10,
            protocolFee_: 100

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

        // Verify canceled bid size matches original bid size
        const canceledBidSize = await auction.lastCancelledBidSize();
        expect(canceledBidSize).to.equal(10000);

        // Try to cancel bid again
        await expect(
            auction.connect(bidder).testCancelBidLedger(auctionKey, 0)
        ).to.be.revertedWith("AFCC");
    });

    it("should increase bid size without changing clearing level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place initial bid
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1760,
            0
        );

        // Get initial bid state
        const bidKey = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const initialBid = await auction.getAuctionBid(bidKey);
        expect(initialBid.bidSize_).to.equal(100000);

        // Increase bid size
        await auction.connect(bidder).testIncreaseBidLedger(
            auctionKey,
            0,
            1000 // Small delta that won't change clearing level
        );

        // Verify bid size increased
        const updatedBid = await auction.getAuctionBid(bidKey);
        expect(updatedBid.bidSize_).to.equal(101000);

        // Verify clearing level stayed the same
        const state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1680);

        // Verify level size increased correctly
        const levelSize = await auction.getLevelSize(auctionKey, 1760);
        expect(levelSize).to.equal(101000);
    });

    it("should increase bid size with multiple bids at same level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place first bid at 1760
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1760,
            0
        );

        // Place second bid at same level
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1760,
            1
        );

        // Increase second bid by 1000
        await auction.connect(bidder).testIncreaseBidLedger(
            auctionKey,
            1,
            1000
        );

        // Verify total level size is 201000
        const levelSize = await auction.getLevelSize(auctionKey, 1760);
        expect(levelSize).to.equal(201000);
    });
    
    it("should increase bid size and update clearing level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place initial bid
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1760,
            0
        );

        // Get initial bid state
        const bidKey = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const initialBid = await auction.getAuctionBid(bidKey);
        expect(initialBid.bidSize_).to.equal(100000);

        // Increase bid size
        await auction.connect(bidder).testIncreaseBidLedger(
            auctionKey,
            0,
            400000 // Delta to increase by
        );

        // Verify bid size increased
        const updatedBid = await auction.getAuctionBid(bidKey);
        expect(updatedBid.bidSize_).to.equal(500000);

        // Verify clearing level increased
        const state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1760);
    });

    it("increase bid size to exact clearing level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place initial bid
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1760,
            0
        );

        // Get initial bid state
        const bidKey = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const initialBid = await auction.getAuctionBid(bidKey);
        expect(initialBid.bidSize_).to.equal(100000);

        const marketCap = await auctionLib.testGetMcapForLevel(1760, context.auctionSupply_);
        const exactFillAmount = marketCap.sub(100000).toNumber()

        // Increase bid size
        await auction.connect(bidder).testIncreaseBidLedger(
            auctionKey,
            0,
            exactFillAmount
        );

        // Verify bid size increased
        const updatedBid = await auction.getAuctionBid(bidKey);
        expect(updatedBid.bidSize_).to.equal(500000);

        // Verify clearing level increased
        const state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1760);
    });

    it("should reject bid increase that oversizes clearing level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place initial bid
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1750,
            0
        );

        // Get initial bid state
        const bidKey = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const initialBid = await auction.getAuctionBid(bidKey);
        expect(initialBid.bidSize_).to.equal(100000);

        const marketCap = await auctionLib.testGetMcapForLevel(1750, context.auctionSupply_);
        const exactFillAmount = marketCap.sub(100000).toNumber()

        // Attempt to increase bid size beyond level capacity
        await expect(
            auction.connect(bidder).testIncreaseBidLedger(
                auctionKey,
                0,
                exactFillAmount + 1 // One more than exact fill
            )
        ).to.be.revertedWith("AFOS");
    });

    it("should reject bid increase on non-existent bid", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Attempt to increase non-existent bid
        await expect(
            auction.connect(bidder).testIncreaseBidLedger(
                auctionKey,
                0, // Bid index that doesn't exist
                1000
            )
        ).to.be.revertedWith("AFCB");
    });

    it("should reject bid increase when bid is at clearing level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place initial bid at 1760
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1760,
            0
        );

        // Place second bid to move clearing level to 1760
        const marketCap = await auctionLib.testGetMcapForLevel(1760, context.auctionSupply_);
        const exactFillAmount = marketCap.sub(100000).toNumber();

        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            exactFillAmount,
            1760,
            1
        );

        // Attempt to increase first bid when at clearing level
        await expect(
            auction.connect(bidder).testIncreaseBidLedger(
                auctionKey,
                0,
                1 // Try to increase by 1
            )
        ).to.be.revertedWith("AFCB");
    });

    it("should reject bid increase when bid is below clearing level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
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
            100000,
            1690,
            0
        );

        // Place second bid at higher level to move clearing level up
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            500000,
            3000,
            1
        );

        // Attempt to increase first bid which is now below clearing level
        await expect(
            auction.connect(bidder).testIncreaseBidLedger(
                auctionKey,
                0,
                1 // Try to increase by 1
            )
        ).to.be.revertedWith("AFCB");
    });

    it("should modify bid level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place initial bid at level 3000
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            3000,
            0
        );

        // Verify initial state
        const bidKey = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        let bid = await auction.getAuctionBid(bidKey);
        expect(bid.bidSize_).to.equal(100000);
        expect(bid.limitLevel_).to.equal(3000);
        let levelSize = await auction.getLevelSize(auctionKey, 3000);
        expect(levelSize).to.equal(100000);

        // Verify initial auction state
        let state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1680);
        expect(state.cumLiftingBids_).to.equal(100000);

        // Modify bid level to 2000
        await auction.connect(bidder).testModifyBidLevelLedger(
            auctionKey,
            0,
            3100
        );

        // Verify state after first modification
        bid = await auction.getAuctionBid(bidKey);
        expect(bid.bidSize_).to.equal(100000);
        expect(bid.limitLevel_).to.equal(3100);
        
        levelSize = await auction.getLevelSize(auctionKey, 3000);
        expect(levelSize).to.equal(0);
        levelSize = await auction.getLevelSize(auctionKey, 3100);
        expect(levelSize).to.equal(100000);

        state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1680);
        expect(state.cumLiftingBids_).to.equal(100000);

        // Modify bid level to 4000
        await auction.connect(bidder).testModifyBidLevelLedger(
            auctionKey,
            0,
            4000
        );

        // Verify final state
        bid = await auction.getAuctionBid(bidKey);
        expect(bid.bidSize_).to.equal(100000);
        expect(bid.limitLevel_).to.equal(4000);

        levelSize = await auction.getLevelSize(auctionKey, 3100);
        expect(levelSize).to.equal(0);
        levelSize = await auction.getLevelSize(auctionKey, 4000);
        expect(levelSize).to.equal(100000);

        state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1680);
        expect(state.cumLiftingBids_).to.equal(100000);
    });

    it("should modify bid level with existing bids at other levels", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place initial bids at various levels
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            15,
            2500,
            0
        );

        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            20,
            3000,
            1
        );

        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            25,
            4000,
            2
        );

        // Place bid that will be modified
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1760,
            3
        );

        const bidKey = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 3);
        let bid = await auction.getAuctionBid(bidKey);
        expect(bid.bidSize_).to.equal(100000);
        expect(bid.limitLevel_).to.equal(1760);

        let levelSize = await auction.getLevelSize(auctionKey, 1760);
        expect(levelSize).to.equal(100000);

        // Verify initial auction state
        let state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1680);
        expect(state.cumLiftingBids_).to.equal(100060);

        // Modify bid level to 2000
        await auction.connect(bidder).testModifyBidLevelLedger(
            auctionKey,
            3,
            2000
        );

        // Verify state after first modification
        bid = await auction.getAuctionBid(bidKey);
        expect(bid.bidSize_).to.equal(100000);
        expect(bid.limitLevel_).to.equal(2000);
        
        levelSize = await auction.getLevelSize(auctionKey, 1760);
        expect(levelSize).to.equal(0);
        levelSize = await auction.getLevelSize(auctionKey, 2000);
        expect(levelSize).to.equal(100000);
        levelSize = await auction.getLevelSize(auctionKey, 2500);
        expect(levelSize).to.equal(15);
        levelSize = await auction.getLevelSize(auctionKey, 3000);
        expect(levelSize).to.equal(20);
        levelSize = await auction.getLevelSize(auctionKey, 4000);
        expect(levelSize).to.equal(25);

        state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1680);
        expect(state.cumLiftingBids_).to.equal(100060);

        // Modify bid level to 4000
        await auction.connect(bidder).testModifyBidLevelLedger(
            auctionKey,
            3,
            4000
        );

        // Verify final state
        bid = await auction.getAuctionBid(bidKey);
        expect(bid.bidSize_).to.equal(100000);
        expect(bid.limitLevel_).to.equal(4000);

        levelSize = await auction.getLevelSize(auctionKey, 2000);
        expect(levelSize).to.equal(0);
        levelSize = await auction.getLevelSize(auctionKey, 2500);
        expect(levelSize).to.equal(15);
        levelSize = await auction.getLevelSize(auctionKey, 3000);
        expect(levelSize).to.equal(20);
        levelSize = await auction.getLevelSize(auctionKey, 4000);
        expect(levelSize).to.equal(100025);

        state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1680);
        expect(state.cumLiftingBids_).to.equal(100060);
    });

    it("should reject modify bid level with invalid step size", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place initial bid
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            500,
            2000, // Valid level
            0
        );

        // Try to modify to invalid level (not multiple of stepSize)
        await expect(
            auction.connect(bidder).testModifyBidLevelLedger(
                auctionKey,
                0,
                2505 // Not divisible by 10
            )
        ).to.be.revertedWith("AFSS");
    });

    it("should reject invalid bid level modifications", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place initial bid
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            500,
            2000,
            0
        );

        // Try to modify to lower level
        await expect(
            auction.connect(bidder).testModifyBidLevelLedger(
                auctionKey,
                0,
                1990
            )
        ).to.be.revertedWith("AFML");

        // Try to modify to same level
        await expect(
            auction.connect(bidder).testModifyBidLevelLedger(
                auctionKey,
                0,
                2000
            )
        ).to.be.revertedWith("AFML");

        // Try to modify non-existent bid
        await expect(
            auction.connect(bidder).testModifyBidLevelLedger(
                auctionKey,
                999,
                2100
            )
        ).to.be.revertedWith("AFMC");
    });

    it("should modify bid at clearing level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place initial bid
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1760,
            0
        );

        // Get initial bid state
        let bidKey = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const initialBid = await auction.getAuctionBid(bidKey);
        expect(initialBid.bidSize_).to.equal(100000);

        const marketCap = await auctionLib.testGetMcapForLevel(1760, context.auctionSupply_);
        const exactFillAmount = marketCap.sub(100000).toNumber()

        // Increase bid size
        await auction.connect(bidder).testIncreaseBidLedger(
            auctionKey,
            0,
            exactFillAmount
        );

        let state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1760);
        expect(state.cumLiftingBids_).to.equal(0);

        // Modify bid to higher level
        await auction.connect(bidder).testModifyBidLevelLedger(
            auctionKey,
            0,
            2000
        );

        // Verify bid was modified
        const bid = await auction.getAuctionBid(bidKey);
        expect(bid.limitLevel_).to.equal(2000);

        // Verify auction state
        state = await auction.getAuctionState(auctionKey);
        expect(state.cumLiftingBids_).to.equal(bid.bidSize_); // Bid size now included in lifting bids
        expect(state.clearingLevel_).to.equal(1760); // Level stays same since no new bids below
    });

    it("Should revert when modifying bid level below clearing level", async () => {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place initial bid
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1720,
            0
        );

        // Verify initial clearing level is 1680
        const initialState = await auction.getAuctionState(auctionKey);
        expect(initialState.clearingLevel_).to.equal(1680);

        // Place second bid that pushes clearing level up
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            500000,
            2050,
            1
        );

        // Verify clearing level is 1760
        const state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1760);

        // Attempt to modify bid that's currently below clearing level
        await expect(
            auction.connect(bidder).testModifyBidLevelLedger(
                auctionKey,
                0,
                3000
            )
        ).to.be.revertedWith("AFMK");
    });

    it("should allow claiming bid above clearing level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
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
            2000,
            0
        );

        // Multiple bids at same level to ensure we're checking bid and not level size
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            1000,
            2000,
            1
        );

        // Place second bid that sets clearing level lower
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            500000,
            1800,
            2
        );

        // Verify clearing level
        const state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1760);

        // Should be able to claim first bid since it's above clearing
        const bidKey = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const bid = await auction.getAuctionBid(bidKey);
        expect(bid.limitLevel_).to.equal(2000);
        expect(bid.bidSize_).to.equal(100000);

        // Claim the bid
        await auction.connect(bidder).testClaimBidLedger(
            auctionKey,
            0
        );

        // Verify bid was claimed
        const claimedBid = await auction.getAuctionBid(bidKey);
        expect(claimedBid.bidSize_).to.equal(0);
        expect(claimedBid.limitLevel_).to.equal(0);

        let claimPrice = await auctionLib.testGetPriceForLevel(1760);
        expect(claimPrice).to.equal(BigNumber.from(1).shl(63)) // Claim price should be 0.5

        expect(await auction.lastBidRefund()).to.equal(0);
        expect(await auction.lastShares()).to.equal(200000);

        // Try to cancel claimed bid
        await expect(
            auction.connect(bidder).testCancelBidLedger(auctionKey, 0)
        ).to.be.revertedWith("AFCC");

        // Try to increase size of claimed bid
        await expect(
            auction.connect(bidder).testIncreaseBidLedger(auctionKey, 0, 50000)
        ).to.be.revertedWith("AFCB");

        // Try to modify level of claimed bid
        await expect(
            auction.connect(bidder).testModifyBidLevelLedger(auctionKey, 0, 1900)
        ).to.be.revertedWith("AFMC");

        // Try to claim already claimed bid
        await expect(
            auction.connect(bidder).testClaimBidLedger(auctionKey, 0)
        ).to.be.revertedWith("AFCC");
    });

    it("claim below clearing level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place first bid at clearing level
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100000,
            1690,
            0
        );

        // Multiple bids at same level
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            100,
            1690,
            1
        );

        // Place large bid at higher level that pushes clearing level up
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            500000,
            1800,
            2
        );

        // Verify clearing level
        const state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1760);

        // Should be able to claim first bid since it's at clearing
        const bidKey = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const bid = await auction.getAuctionBid(bidKey);
        expect(bid.limitLevel_).to.equal(1690);
        expect(bid.bidSize_).to.equal(100000);

        // Claim the bid
        await auction.connect(bidder).testClaimBidLedger(
            auctionKey,
            0
        );

        // Verify bid was claimed
        const claimedBid = await auction.getAuctionBid(bidKey);
        expect(claimedBid.bidSize_).to.equal(0);
        expect(claimedBid.limitLevel_).to.equal(0);

        // Verify full refund since bid was below clearing
        expect(await auction.lastBidRefund()).to.equal(100000);
        expect(await auction.lastShares()).to.equal(0);
    });

    it("claim at clearing level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        let fillAmount = await auctionLib.testGetMcapForLevel(1760, context.auctionSupply_);

        // Place bid
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            fillAmount.div(4).mul(3),
            1760,
            0
        );

        // Multiple bids at same level
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            fillAmount.div(4),
            1760,
            1
        );

        // Verify clearing level
        const state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1760);

        // Claim the bid
        await auction.connect(bidder).testClaimBidLedger(
            auctionKey,
            0
        );

        // Verify bid was claimed
        const bidKey = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const claimedBid = await auction.getAuctionBid(bidKey);
        expect(claimedBid.bidSize_).to.equal(0);
        expect(claimedBid.limitLevel_).to.equal(0);

        // Fills at price of 0.5
        expect(await auction.lastBidRefund()).to.equal(0);
        expect(await auction.lastShares()).to.equal(fillAmount.div(4).mul(3).mul(2));
    });

    it("partial fill at clearing level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        let fillAmount = await auctionLib.testGetMcapForLevel(1760, context.auctionSupply_);

        // Place bid above at clearing level for half size
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            fillAmount.div(2),
            1760,
            1
        );

        // Multiple bids at same level
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            fillAmount.div(2),
            1760,
            2
        );

        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            fillAmount.div(4),
            2000,
            0
        );

        // Verify clearing level
        const state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1760);

        // Claim the bid
        await auction.connect(bidder).testClaimBidLedger(
            auctionKey,
            1
        );

        // Verify bid was claimed
        const bidKey = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 1);
        const claimedBid = await auction.getAuctionBid(bidKey);
        expect(claimedBid.bidSize_).to.equal(0);
        expect(claimedBid.limitLevel_).to.equal(0);

        // Since 1/4 was filled above level, the refund rate should be 1/4 (on a size of 1/2)
        expect(await auction.lastBidRefund()).to.equal(fillAmount.div(2).div(4));
        expect(await auction.lastShares()).to.equal(fillAmount.div(2).div(4).mul(3).mul(2));
    });

    it("weak auction with half fill", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 1760, // Set high start level as reserve price
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Calculate expected fill amount at reserve level
        let fillAmount = await auctionLib.testGetMcapForLevel(1760, context.auctionSupply_);

        // Place bid at reserve level for half the fill amount
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            fillAmount.div(4),
            1770,
            0
        );

        // Verify clearing level stays at start level
        const state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1760);

        // Claim the bid
        await auction.connect(bidder).testClaimBidLedger(
            auctionKey,
            0
        );

        // Verify bid was claimed
        const bidKey = await auctionLib.testHashAuctionBid(auctionKey, bidder.address, 0);
        const claimedBid = await auction.getAuctionBid(bidKey);
        expect(claimedBid.bidSize_).to.equal(0);
        expect(claimedBid.limitLevel_).to.equal(0);

        // Full claim should be filled since its a weak auction
        expect(await auction.lastShares()).to.equal(fillAmount.div(4).mul(2));
        expect(await auction.lastBidRefund()).to.equal(0);
    });

    it("should refund single bid auction", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place bid that fully clears auction
        const fillAmount = await auctionLib.testGetMcapForLevel(1760, context.auctionSupply_);
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            fillAmount,
            1760,
            0
        );

        // Verify clearing level
        const state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1760);

        // Refund the auction
        await auction.connect(auctioneer).testRefundLedger(ZERO_ADDR, ADDR_TWO, 0);

        // Verify no shares were issued
        expect(await auction.lastSupplyReturn()).to.equal(0);
        expect(await auction.lastDemandReturn()).to.equal(fillAmount);
        expect(await auction.lastAuctionKey()).to.equal(auctionKey);

        // Second refund should revert
        await expect(
            auction.connect(auctioneer).testRefundLedger(ZERO_ADDR, ADDR_TWO, 0)
        ).to.be.revertedWith("AFMR");
    });

    it("refund multiple bid auction", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 100,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Place bid that fully clears auction
        const fillAmount = await auctionLib.testGetMcapForLevel(1760, context.auctionSupply_);
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            fillAmount.div(10),
            1680,
            0
        );
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            fillAmount.div(4),
            1760,
            1
        );
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            fillAmount.div(2),
            1760,
            2
        );
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            fillAmount.div(4),
            2500,
            3
        );

        // Verify clearing level
        const state = await auction.getAuctionState(auctionKey);
        expect(state.clearingLevel_).to.equal(1760);

        // Refund the auction
        await auction.connect(auctioneer).testRefundLedger(ZERO_ADDR, ADDR_TWO, 0);

        // Verify no shares were issued
        expect(await auction.lastSupplyReturn()).to.equal(0);
        expect(await auction.lastDemandReturn()).to.equal(fillAmount);
        expect(await auction.lastAuctionKey()).to.equal(auctionKey);
    });

    it("Should correctly refund a weak auction", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000*1000,
            startLevel_: 1760,
            stepSize_: 10,
            protocolFee_: 100
        };

        await auction.connect(auctioneer).testInitAuctionLedger(
            ZERO_ADDR,
            ADDR_TWO,
            0,
            context
        );
        const auctionKey = await auction.lastAuctionKey();

        // Calculate expected fill at start level
        const expectedFill = await auctionLib.testGetMcapForLevel(1760, context.auctionSupply_);

        // Place bids totaling 75% of needed fill
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            expectedFill.div(2),
            1770,
            0
        );
        await auction.connect(bidder).testPlaceBidLedger(
            auctionKey,
            expectedFill.div(4),
            2100,
            1
        );

        // Refund the auction
        await auction.connect(auctioneer).testRefundLedger(ZERO_ADDR, ADDR_TWO, 0);

        // Verify refund amounts - should get back 75% of mcap and 25% of supply
        expect(await auction.lastDemandReturn()).to.equal(expectedFill.mul(3).div(4));
        expect(await auction.lastSupplyReturn()).to.equal(context.auctionSupply_/4);
        expect(await auction.lastAuctionKey()).to.equal(auctionKey);

        // Verify second refund reverts
        await expect(
            auction.connect(auctioneer).testRefundLedger(ZERO_ADDR, ADDR_TWO, 0)
        ).to.be.revertedWith("AFMR");
    });
});
