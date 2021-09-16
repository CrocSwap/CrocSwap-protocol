import { TestBitmapsLib } from '../typechain/TestBitmapsLib'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';

describe('BitmapsLib', () => {
   let bitmaps: TestBitmapsLib

   beforeEach("deploy TestBitmapsLib", async () => {
      const bitmapLib = await ethers.getContractFactory("TestBitmapsLib");
      bitmaps = (await bitmapLib.deploy()) as TestBitmapsLib;
   })

   it("truncateRight", async () => {
      let result = await bitmaps.testTruncateRight(1024 + 64 + 32 + 8 + 1, 4);
      expect(result.toNumber()).to.equal(1024 + 64 + 32);
   })

   it("truncateLeft", async () => {
      let result = await bitmaps.testTruncateLeft(1024 + 64 + 32 + 8 + 1, 250);
      expect(result.toNumber()).to.equal(32 + 8 + 1);
   })

   it("isBitSet", async() => {
      let bitmap = 1024 + 64 + 32 + 8 + 1;
      expect(await bitmaps.testBitSet(bitmap, 0)).to.equal(true);
      expect(await bitmaps.testBitSet(bitmap, 1)).to.equal(false);
      expect(await bitmaps.testBitSet(bitmap, 2)).to.equal(false);
      expect(await bitmaps.testBitSet(bitmap, 3)).to.equal(true);
      expect(await bitmaps.testBitSet(bitmap, 4)).to.equal(false);
      expect(await bitmaps.testBitSet(bitmap, 5)).to.equal(true);
      expect(await bitmaps.testBitSet(bitmap, 6)).to.equal(true);
      expect(await bitmaps.testBitSet(bitmap, 9)).to.equal(false);
      expect(await bitmaps.testBitSet(bitmap, 10)).to.equal(true);
      expect(await bitmaps.testBitSet(bitmap, 11)).to.equal(false);
      expect(await bitmaps.testBitSet(bitmap, 200)).to.equal(false);
      expect(await bitmaps.testBitSet(bitmap, 255)).to.equal(false);
   })

   it("indexPosLeft", async () => {
      let result = await bitmaps.testBitLeft(64 + 32 + 8 + 1, 0);
      expect(result[1]).to.equal(false);
      expect(result[0]).to.equal(6);
   })

   it("indexPosRight", async () => {
      let result = await bitmaps.testBitRight(1024 + 64 + 32 + 8, 0);
      expect(result[1]).to.equal(false);
      expect(result[0]).to.equal(3);
   })

   it("shiftPosLeft", async () => {
      let result = await bitmaps.testBitLeft(1024 + 64 + 32 + 8 + 1, 250);
      expect(result[1]).to.equal(false);
      expect(result[0]).to.equal(5);
   })

   it("shiftPosRight", async () => {
      let result = await bitmaps.testBitRight(1024 + 64 + 32 + 8 + 1, 4);
      expect(result[1]).to.equal(false);
      expect(result[0]).to.equal(5);
   })

   it("spillPosLeft", async () => {
      let result = await bitmaps.testBitLeft(1024 + 64 + 32 + 8, 253);
      expect(result[1]).to.equal(true);
   })

   it("spillPosRight", async () => {
      let result = await bitmaps.testBitRight(1024 + 64 + 32 + 8 + 1, 11);
      expect(result[1]).to.equal(true);
   })

   it("castIndex", async() => {
      let castNeg = await bitmaps.testUncastIndex(0);      
      let castNegOne = await bitmaps.testUncastIndex(127);
      let castZero = await bitmaps.testUncastIndex(128);
      let castPos = await bitmaps.testUncastIndex(255);
      let uncastNeg = await bitmaps.testCastIndex(-128);
      let uncastNegOne = await bitmaps.testCastIndex(-1);
      let uncastZero = await bitmaps.testCastIndex(0);
      let uncastPos = await bitmaps.testCastIndex(127);
      expect(castNeg).to.equal(-128);
      expect(castNegOne).to.equal(-1);
      expect(castZero).to.equal(0);
      expect(castPos).to.equal(127);
      expect(uncastNeg).to.equal(0);
      expect(uncastZero).to.equal(127);
      expect(uncastZero).to.equal(128);
      expect(uncastPos).to.equal(255);
   })

   it("lobbyMezzTerm Decomp", async () => {
      let lobby = -89;
      let mezz = 215;
      let term = 56;
      let tick = lobby * 256 * 256 + mezz * 256 + term;
      let result = await bitmaps.testDecomp(tick);
      expect(result[0]).to.equal(lobby);
      expect(result[1]).to.equal(lobby * 256 + mezz);
      expect(result[2]).to.equal(lobby + 128);
      expect(result[3]).to.equal(mezz);
      expect(result[4]).to.equal(term);
   })

   it("term shift", async() => {
      let lobby = -89;
      let mezz = 215;
      let term = 56;
      let tick = lobby * 256 * 256 + mezz * 256 + term;
      let tickEdgeLeft = lobby * 256 * 256 + mezz * 256 + 255;
      let tickEdgeRight = lobby * 256 * 256 + mezz * 256 + 0;

      let resultBuy = await bitmaps.testShiftBump(tick, true);
      let resultSell = await bitmaps.testShiftBump(tick, false);
      let resultEdgeLeftBuy = await bitmaps.testShiftBump(tickEdgeLeft, true);
      let resultEdgeLeftSell = await bitmaps.testShiftBump(tickEdgeLeft, false);
      let resultEdgeRightBuy = await bitmaps.testShiftBump(tickEdgeRight, true);
      let resultEdgeRightSell = await bitmaps.testShiftBump(tickEdgeRight, false);

      expect(resultBuy).to.equal(57);
      expect(resultSell).to.equal(199);
      expect(resultEdgeLeftBuy).to.equal(256);
      expect(resultEdgeLeftSell).to.equal(0);
      expect(resultEdgeRightBuy).to.equal(1);
      expect(resultEdgeRightSell).to.equal(255);
   })
})
