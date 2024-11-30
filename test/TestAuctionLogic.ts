import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { TestAuctionLogic } from "../typechain";

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

  describe("Level to Market Cap Calculations", () => {
    it("should calculate correct mcap for level 0", async () => {
      const mcap = await testAuctionLogic.testGetMcapForLevel(0);
      expect(mcap).to.equal(ethers.BigNumber.from(1).shl(64)); // 1.0 in X64.64 format
    });
    it("should calculate correct mcap for level 8 (price doubles)", async () => {
      const mcap = await testAuctionLogic.testGetMcapForLevel(8);
      expect(mcap).to.equal(ethers.BigNumber.from(2).shl(64)); // 2.0 in X64.64 format
    });

    it("should calculate correct mcap for intermediate levels", async () => {
      // Level 4 should be approximately sqrt(2) = ~1.414
      const mcap = await testAuctionLogic.testGetMcapForLevel(4);
      const expected = ethers.BigNumber.from(Math.floor(1.414 * 2**64));
      
      // Allow small rounding difference
      const diff = mcap.sub(expected).abs();
      expect(diff).to.be.lt(ethers.BigNumber.from(2).shl(60)); // ~0.1% tolerance
    });

    it("should maintain geometric progression between levels", async () => {
      const mcap1 = await testAuctionLogic.testGetMcapForLevel(1);
      const mcap2 = await testAuctionLogic.testGetMcapForLevel(2);
      const mcap3 = await testAuctionLogic.testGetMcapForLevel(3);

      // Each step should increase by same ratio (1 + 2^(1/8))
      const ratio1 = mcap2.mul(ethers.constants.WeiPerEther).div(mcap1);
      const ratio2 = mcap3.mul(ethers.constants.WeiPerEther).div(mcap2);
      
      const diff = ratio1.sub(ratio2).abs();
      expect(diff).to.be.lt(ethers.utils.parseEther("0.0001"));
    });
  });

  describe("Level Calculations", () => {
    it("should calculate correct level capacity", async () => {
      const totalSupply = ethers.utils.parseEther("1000");
      const level = 8; // At level 8, price doubles
      const capacity = await testAuctionLogic.testGetLevelCapacity(totalSupply, level);
      expect(capacity).to.equal(totalSupply.mul(2));
    });

    it("should calculate correct mcap for levels", async () => {
      const level0 = await testAuctionLogic.testGetMcapForLevel(0);
      const level8 = await testAuctionLogic.testGetMcapForLevel(8);
      expect(level8).to.equal(level0.mul(2));
    });
  });

  describe("Auction Calculations", () => {
    it("should calculate auction proceeds correctly", async () => {
      const level = 0;
      const totalSupply = ethers.utils.parseEther("1000");
      const bidSize = ethers.utils.parseEther("1000");
      const proceeds = await testAuctionLogic.testCalcAuctionProceeds(
        level,
        totalSupply,
        bidSize
      );
      expect(proceeds).to.equal(totalSupply);
    });

    it("should calculate pro-rata shrink correctly", async () => {
      const cumBids = ethers.utils.parseEther("500");
      const levelBids = ethers.utils.parseEther("1000");
      const totalSupply = ethers.utils.parseEther("1000");
      const proRata = await testAuctionLogic.testDeriveProRataShrink(
        cumBids,
        levelBids,
        totalSupply
      );
      // At 50% cumBids, remaining 50% should be split pro-rata
      expect(proRata).to.equal(ethers.utils.parseUnits("0.5", 64));
    });

    it("should calculate clearing level shares correctly", async () => {
      const level = 0;
      const totalSupply = ethers.utils.parseEther("1000");
      const bidSize = ethers.utils.parseEther("100");
      const proRata = ethers.utils.parseUnits("0.5", 64); // 50% fill rate
      
      const { shares, bidRefund } = await testAuctionLogic.testCalcClearingLevelShares(
        level,
        totalSupply,
        bidSize,
        proRata
      );
      expect(shares).to.equal(bidSize.div(2));
      expect(bidRefund).to.equal(bidSize.div(2));
    });

  });
});
