import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TestAuctionLogic } from "../typechain";
import { BigNumber } from "ethers";
import { solidity } from "ethereum-waffle";
import chai from "chai";

chai.use(solidity);

describe("AuctionLogic", () => {
  let testAuctionLogic: TestAuctionLogic;
  let owner: SignerWithAddress;
  let owner2: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;

  beforeEach(async () => {
    [owner, addr1, addr2, owner2] = await ethers.getSigners();
    const TestAuctionLogic = await ethers.getContractFactory("TestAuctionLogic");
    testAuctionLogic = (await TestAuctionLogic.deploy()) as TestAuctionLogic;
    await testAuctionLogic.deployed();
  });

  describe("Hash Functions", () => {
    it("should generate unique auction pool hashes", async () => {
      const hash1 = await testAuctionLogic.testHashAuctionPool(
        addr1.address,
        addr2.address,
        owner.address,
        1
      );
      const hash2 = await testAuctionLogic.testHashAuctionPool(
        addr1.address,
        addr2.address,
        owner.address,
        2
      );
      const hash3 = await testAuctionLogic.testHashAuctionPool(
        addr2.address,
        addr1.address,
        owner.address,
        1
      );
      const hash4 = await testAuctionLogic.testHashAuctionPool(
        addr1.address,
        addr2.address,
        owner2.address,
        1
      );
      expect(hash1).to.not.equal(hash2);
      expect(hash1).to.not.equal(hash3);
      expect(hash1).to.not.equal(hash4);
    });

    it("should generate unique bid hashes", async () => {
      const auctionKey = ethers.utils.formatBytes32String("test");
      const auctionKey2 = ethers.utils.formatBytes32String("test2");
      const hash1 = await testAuctionLogic.testHashAuctionBid(
        auctionKey,
        addr1.address,
        1
      );
      const hash2 = await testAuctionLogic.testHashAuctionBid(
        auctionKey,
        addr1.address,
        2
      );
      const hash3 = await testAuctionLogic.testHashAuctionBid(
        auctionKey,
        addr2.address,
        1
      );
      const hash4 = await testAuctionLogic.testHashAuctionBid(
        auctionKey2,
        addr1.address,
        1
      );
      expect(hash1).to.not.equal(hash2);
      expect(hash1).to.not.equal(hash3);
      expect(hash1).to.not.equal(hash4);
    });
  });

  describe("Level to Price Calculations", () => {
    it("should calculate correct mcap for level 0", async () => {
      const mcap = await testAuctionLogic.testGetPriceForLevel(0);
      expect(mcap).to.equal(BigNumber.from(1).shl(8)); // 2^-16 in X64.64 format
    });

    it("should calculate correct price for level 32 (price doubles)", async () => {
      const price = await testAuctionLogic.testGetPriceForLevel(32);
      expect(price).to.equal(BigNumber.from(2).shl(8)); // 2.0 * 2^8 in X64.64 format
    });

    it("should calculate correct price for X64.64", async () => {
        const price = await testAuctionLogic.testGetPriceForLevel(16*32);
        expect(price).to.equal(BigNumber.from(1).shl(24)); // 1 in X64.64 format
    });
  
    it("should calculate correct price for 8 * X64.64", async () => {
        const price = await testAuctionLogic.testGetPriceForLevel(16*32 + 32 * 3);
        expect(price).to.equal(BigNumber.from(8).shl(24)); // 8 in X64.64 format
    });

    it("calculates decimal step", async () => {
        const price = await testAuctionLogic.testGetPriceForLevel(16*32 + 32 * 3 + 1);
        const one = BigNumber.from(8).shl(24);
        const fraction = one.div(32)
        expect(price).to.equal(one.add(fraction)); // 8.03125 in X64.64 format
    });
    
    it("calculates decimal steps", async () => {
        const price = await testAuctionLogic.testGetPriceForLevel(16*32 + 32 * 3 + 21);
        const one = BigNumber.from(8).shl(24);
        const fraction = one.div(32).mul(21)
        expect(price).to.equal(one.add(fraction));
    });

    it("calculates decimal steps end", async () => {
        const price = await testAuctionLogic.testGetPriceForLevel(16*32 + 32 * 3 + 31);
        const one = BigNumber.from(8).shl(24);
        const fraction = one.div(32)
        expect(price).to.equal(one.mul(2).sub(fraction));
    });

    it("should calculate correct mcap for level", async () => {
      const level = 56*32 + 32*3;
      const totalSupply = BigNumber.from(25000);
      const mcap = await testAuctionLogic.testGetMcapForLevel(level, totalSupply);
      
      // At price 8.0, mcap should be totalSupply * 8.0 = 200,000
      expect(mcap).to.equal(200000);
    });
  });

  describe("Auction Proceeds", () => {
    it("should calculate auction proceeds at base level", async () => {
      const bidSize = BigNumber.from(10000);
      const level = 60 * 32; // Price per token is .0625

      const proceeds = await testAuctionLogic.testCalcAuctionProceeds(level, bidSize);

      // For a bid of 1000, should receive 1000 * .0625 = 62.5, rounded down to 62
      expect(proceeds).to.equal(625);
    });

    it("rounds down", async () => {
        const bidSize = BigNumber.from(1000);
        const level = 60 * 32; // Price per token is .0625
  
        const proceeds = await testAuctionLogic.testCalcAuctionProceeds(level, bidSize);
  
        // For a bid of 1000, should receive 1000 * .0625 = 62.5, rounded down to 62
        expect(proceeds).to.equal(62);
      });
  
  });

  describe("Pro Rata Calculations", () => {
    const ONE = BigNumber.from(1).shl(64);

    it("should calculate pro rata shrink with no level bids", async () => {
      const cumBids = BigNumber.from(500);
      const levelBids = BigNumber.from(0);
      const totalSupply = BigNumber.from(1000);

      const proRata = await testAuctionLogic.testDeriveProRataShrink(cumBids, levelBids, totalSupply);
      expect(proRata).to.equal(ONE);
    });

    it("no shrink filled above", async () => {
        const cumBids = BigNumber.from(1000);
        const levelBids = BigNumber.from(0);
        const totalSupply = BigNumber.from(1000);
  
        const proRata = await testAuctionLogic.testDeriveProRataShrink(cumBids, levelBids, totalSupply);
        expect(proRata).to.equal(ONE);
    });

    it("no shrink split fill above", async () => {
        const cumBids = BigNumber.from(300);
        const levelBids = BigNumber.from(700);
        const totalSupply = BigNumber.from(1000);
  
        const proRata = await testAuctionLogic.testDeriveProRataShrink(cumBids, levelBids, totalSupply);
        expect(proRata).to.equal(ONE);
    });

    it("oversized fill", async () => {
        const cumBids = BigNumber.from(300);
        const levelBids = BigNumber.from(400);
        const totalSupply = BigNumber.from(1000);
  
        const proRata = await testAuctionLogic.testDeriveProRataShrink(cumBids, levelBids, totalSupply);
        expect(proRata).to.equal(ONE);
    });

    it("shrink partial fill", async () => {
      const cumBids = BigNumber.from(750);
      const levelBids = BigNumber.from(1000);
      const totalSupply = BigNumber.from(1000);

      const proRata = await testAuctionLogic.testDeriveProRataShrink(cumBids, levelBids, totalSupply);
      expect(proRata).to.equal(ONE.div(4));
    });

    it("shrink partial fill (2)", async () => {
        const cumBids = BigNumber.from(250);
        const levelBids = BigNumber.from(1000);
        const totalSupply = BigNumber.from(1000);
  
        const proRata = await testAuctionLogic.testDeriveProRataShrink(cumBids, levelBids, totalSupply);
        expect(proRata).to.equal(ONE.div(4).mul(3));
    });  

    it("shrink partial fill (3)", async () => {
        const cumBids = BigNumber.from(750);
        const levelBids = BigNumber.from(2000);
        const totalSupply = BigNumber.from(1000);
  
        const proRata = await testAuctionLogic.testDeriveProRataShrink(cumBids, levelBids, totalSupply);
        expect(proRata).to.equal(ONE.div(8));
    });  

    it("partial fill round down", async () => {
        const cumBids = BigNumber.from(700);
        const levelBids = BigNumber.from(1000);
        const totalSupply = BigNumber.from(1000);
  
        const proRata = await testAuctionLogic.testDeriveProRataShrink(cumBids, levelBids, totalSupply);
        expect(proRata).to.equal(ONE.mul(3).div(10));
    });  
  });

  describe("calcClearingLevelShares", async () => {
    const ONE = BigNumber.from(1).shl(64);

    it("full fill", async () => {
      const level = 32;
      const bidSize = BigNumber.from(1000);
      const proRata = ONE;

      const result = await testAuctionLogic.testCalcClearingLevelShares(level, bidSize, proRata);
      const shares = result.shares;
      const refund = result.bidRefund;
      expect(refund).to.equal(0);
      expect(shares).to.equal(await testAuctionLogic.testCalcAuctionProceeds(level, bidSize));
    });

    it("half fill", async () => {
      const level = 32;
      const bidSize = BigNumber.from(1000);
      const proRata = ONE.div(2);

      const result = await testAuctionLogic.testCalcClearingLevelShares(level, bidSize, proRata);
      const shares = result.shares;
      const refund = result.bidRefund;
      const expectedShares = (await testAuctionLogic.testCalcAuctionProceeds(level, bidSize)).div(2);
      expect(shares).to.equal(expectedShares);
      expect(refund).to.equal(bidSize.div(2));
    });

    it("quarter fill", async () => {
      const level = 32;
      const bidSize = BigNumber.from(1000);
      const proRata = ONE.div(4);

      const result = await testAuctionLogic.testCalcClearingLevelShares(level, bidSize, proRata);
      const shares = result.shares;
      const refund = result.bidRefund;
      const expectedShares = (await testAuctionLogic.testCalcAuctionProceeds(level, bidSize)).div(4);
      expect(shares).to.equal(expectedShares);
      expect(refund).to.equal(bidSize.mul(3).div(4));
    });

    it("zero fill", async () => {
      const level = 32;
      const bidSize = BigNumber.from(1000);
      const proRata = BigNumber.from(0);

      const result = await testAuctionLogic.testCalcClearingLevelShares(level, bidSize, proRata);
      const shares = result.shares;
      const refund = result.bidRefund;
      expect(shares).to.equal(0);
      expect(refund).to.equal(bidSize);
    });
  });

  describe("calcReservePayout", () => {
    it("full fill", async () => {
      const startLevel = 1760;
      const totalSupply = BigNumber.from(100);
      const price = await testAuctionLogic.testGetPriceForLevel(startLevel);
      const totalBids = price.mul(totalSupply).shr(64);

      const result = await testAuctionLogic.testCalcReservePayout(startLevel, totalBids, totalSupply);
      const supplyRefund = result.supplyReturn;
      const bidPayout = result.demandReturn;
      expect(supplyRefund).to.equal(0);
      expect(bidPayout).to.equal(totalBids);
    });

    it("half fill", async () => {
      const startLevel = 1760;
      const totalSupply = BigNumber.from(100);
      const price = await testAuctionLogic.testGetPriceForLevel(startLevel);
      const totalBids = price.mul(totalSupply).shr(64).div(2);

      const result = await testAuctionLogic.testCalcReservePayout(startLevel, totalBids, totalSupply);
      const supplyRefund = result.supplyReturn;
      const bidPayout = result.demandReturn;
      expect(supplyRefund).to.equal(totalSupply.div(2));
      expect(bidPayout).to.equal(totalBids);
    });

    it("quarter fill", async () => {
      const startLevel = 1760;
      const totalSupply = BigNumber.from(1000);
      const price = await testAuctionLogic.testGetPriceForLevel(startLevel);
      const totalBids = price.mul(totalSupply).shr(64).div(4);

      const result = await testAuctionLogic.testCalcReservePayout(startLevel, totalBids, totalSupply);
      const supplyRefund = result.supplyReturn;
      const bidPayout = result.demandReturn;
      expect(supplyRefund).to.equal(totalSupply.mul(3).div(4));
      expect(bidPayout).to.equal(totalBids);
    });

    it("round down", async () => {
      const startLevel = 1760;
      const totalSupply = BigNumber.from(300);
      const price = await testAuctionLogic.testGetPriceForLevel(startLevel);
      const totalBids = price.mul(totalSupply).shr(64).div(3);

      const result = await testAuctionLogic.testCalcReservePayout(startLevel, totalBids, totalSupply);
      const supplyRefund = result.supplyReturn;
      const bidPayout = result.demandReturn;
      expect(supplyRefund).to.equal(201);
      expect(bidPayout).to.equal(49);
    });


    it("zero fill", async () => {
      const startLevel = 1760;
      const totalBids = BigNumber.from(0);
      const totalSupply = BigNumber.from(100);

      const result = await testAuctionLogic.testCalcReservePayout(startLevel, totalBids, totalSupply);
      const supplyRefund = result.supplyReturn;
      const bidPayout = result.demandReturn;
      expect(supplyRefund).to.equal(totalSupply);
      expect(bidPayout).to.equal(0);
    });
  });
});
