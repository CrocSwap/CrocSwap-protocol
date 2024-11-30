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

  describe("Level to Market Cap Calculations", () => {
    it("should calculate correct mcap for level 0", async () => {
      const mcap = await testAuctionLogic.testGetMcapForLevel(0);
      expect(mcap).to.equal(BigNumber.from(1).shl(48)); // 2^-16 in X64.64 format
    });

    it("should calculate correct mcap for level 32 (price doubles)", async () => {
      const mcap = await testAuctionLogic.testGetMcapForLevel(32);
      expect(mcap).to.equal(BigNumber.from(2).shl(48)); // 2.0 * 2^-16 in X64.64 format
    });

    it("should calculate correct mcap for X64.64", async () => {
        const mcap = await testAuctionLogic.testGetMcapForLevel(16*32);
        expect(mcap).to.equal(BigNumber.from(1).shl(64)); // 1 in X64.64 format
    });
  
    it("should calculate correct mcap for 8 * X64.64", async () => {
        const mcap = await testAuctionLogic.testGetMcapForLevel(16*32 + 32 * 3);
        expect(mcap).to.equal(BigNumber.from(8).shl(64)); // 1 in X64.64 format
    });

    it("calculates decimal step", async () => {
        const mcap = await testAuctionLogic.testGetMcapForLevel(16*32 + 32 * 3 + 1);
        const one = BigNumber.from(8).shl(64);
        const fraction = one.div(32)
        expect(mcap).to.equal(one.add(fraction)); // 1.03125 in X64.64 format
    });
    

    it("calculates decimal steps", async () => {
        const mcap = await testAuctionLogic.testGetMcapForLevel(16*32 + 32 * 3 + 21);
        const one = BigNumber.from(8).shl(64);
        const fraction = one.div(32).mul(21)
        expect(mcap).to.equal(one.add(fraction));
    });

    it("calculates decimal steps end", async () => {
        const mcap = await testAuctionLogic.testGetMcapForLevel(16*32 + 32 * 3 + 31);
        const one = BigNumber.from(8).shl(64);
        const fraction = one.div(32)
        expect(mcap).to.equal(one.mul(2).sub(fraction));
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
