
import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ZERO_ADDR } from "./FixedPoint";
import { TestAuctionLedger, TestAuctionLogic } from "../typechain";

describe("AuctionLedger", function() {
    let auction: TestAuctionLedger;
    let auctionLib: TestAuctionLogic;
    let owner: SignerWithAddress;
    let bidder: SignerWithAddress;
    let auctioneer: SignerWithAddress;

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

        await auction.testInitAuctionLedger(
            ZERO_ADDR,
            ZERO_ADDR,
            0,
            context
        );

        const auctionKey = await auctionLib.testHashAuctionPool(ZERO_ADDR, ZERO_ADDR, auctioneer.address, 0);

        const storedContext = await auction.getAuctionContext(auctionKey);
        expect(storedContext.auctionEndTime_).to.equal(context.auctionEndTime_);
        expect(storedContext.auctionSupply_).to.equal(context.auctionSupply_);
        expect(storedContext.startLevel_).to.equal(context.startLevel_);

        const state = await auction.getAuctionState(auctionKey);
        expect(state.activeLevel_).to.equal(context.startLevel_);
    });

    /*it("should place and track bids", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100
        };

        const auctionKey = await auction.testInitAuctionLedger(
            ZERO_ADDR,
            ZERO_ADDR,
            0,
            context
        );

        const bidSize = 500;
        const limitLevel = 150;
        const bidIndex = 0;

        const clearingLevel = await auction.testPlaceBidLedger(
            auctionKey,
            bidSize,
            limitLevel,
            bidIndex
        );

        expect(clearingLevel).to.equal(context.startLevel_);

        const bidKey = await auction.testHashAuctionBid(auctionKey, owner.address, bidIndex);
        const bid = await auction.getAuctionBid(bidKey);
        expect(bid.bidSize_).to.equal(bidSize);
        expect(bid.limitLevel_).to.equal(limitLevel);

        const levelSize = await auction.getLevelSize(auctionKey, limitLevel);
        expect(levelSize).to.equal(bidSize);
    });

    it("should claim filled bids", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100
        };

        const auctionKey = await auction.testInitAuctionLedger(
            ZERO_ADDR,
            ZERO_ADDR,
            0,
            context
        );

        await auction.testPlaceBidLedger(auctionKey, 600, 150, 0);
        await auction.testPlaceBidLedger(auctionKey, 600, 150, 1);

        const [shares, refund] = await auction.testClaimBidLedger(auctionKey, 0);
        expect(shares).to.be.gt(0);
        expect(refund).to.be.lt(600);
    });

    it("should cancel unfilled bids", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100
        };

        const auctionKey = await auction.testInitAuctionLedger(
            ZERO_ADDR,
            ZERO_ADDR,
            0,
            context
        );

        await auction.testPlaceBidLedger(auctionKey, 500, 120, 0);
        await auction.testPlaceBidLedger(auctionKey, 600, 150, 1);

        const refund = await auction.testCancelBidLedger(auctionKey, 0);
        expect(refund).to.equal(500);

        const bidKey = await auction.testHashAuctionBid(auctionKey, owner.address, 0);
        const bid = await auction.getAuctionBid(bidKey);
        expect(bid.bidSize_).to.equal(0);
    });

    it("should increase bid size", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100
        };

        const auctionKey = await auction.testInitAuctionLedger(
            ZERO_ADDR,
            ZERO_ADDR,
            0,
            context
        );

        await auction.testPlaceBidLedger(auctionKey, 500, 150, 0);
        await auction.testIncreaseBidLedger(auctionKey, 0, 200);

        const bidKey = await auction.testHashAuctionBid(auctionKey, owner.address, 0);
        const bid = await auction.getAuctionBid(bidKey);
        expect(bid.bidSize_).to.equal(700);
    });

    it("should modify bid level", async function() {
        const context = {
            auctionEndTime_: Math.floor(Date.now()/1000) + 3600,
            auctionSupply_: 1000,
            startLevel_: 100
        };

        const auctionKey = await auction.testInitAuctionLedger(
            ZERO_ADDR,
            ZERO_ADDR,
            0,
            context
        );

        await auction.testPlaceBidLedger(auctionKey, 500, 150, 0);
        await auction.testModifyBidLevelLedger(auctionKey, 0, 200);

        const bidKey = await auction.testHashAuctionBid(auctionKey, owner.address, 0);
        const bid = await auction.getAuctionBid(bidKey);
        expect(bid.limitLevel_).to.equal(200);
    });*/
});
