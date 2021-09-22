import { TestTickCensus } from '../typechain/TestTickCensus'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';

const TICK_MAX = 127 * 256 * 256 + 255 * 256 + 255;
const TICK_MIN = -128 * 256 * 256 + 0 * 256 + 0;


describe('TickCensus', () => {
   let census: TestTickCensus

   beforeEach("deploy TestBitmapsLib", async () => {
      const factory = await ethers.getContractFactory("TestTickCensus");
      census = (await factory.deploy()) as TestTickCensus;
   })

   it("empty bitmap", async () => {
      let result = await census.getBitmaps(100);
      expect(result[0].toNumber()).to.equal(0);
      expect(result[1].toNumber()).to.equal(0);
   })

   it("bookmark tick", async() => {
      let tick = -120 * 256 * 256 + 12 * 256 + 4
      await census.testBookmark(tick);
      let result = await census.getBitmaps(tick);
      expect(result[0].toNumber()).to.equal(4096);
      expect(result[1].toNumber()).to.equal(16);
   })

   it("bookmark repeat", async() => {
      let tick = -120 * 256 * 256 + 12 * 256 + 4
      await census.testBookmark(tick);
      await census.testBookmark(tick);
      let result = await census.getBitmaps(tick);
      expect(result[0].toNumber()).to.equal(4096);
      expect(result[1].toNumber()).to.equal(16);
   })
   
   it("bookmark two shared", async() => {
      let tickOne = -120 * 256 * 256 + 12 * 256 + 4
      let tickTwo = -120 * 256 * 256 + 12 * 256 + 11
      
      await census.testBookmark(tickOne);
      await census.testBookmark(tickTwo);
      let result = await census.getBitmaps(tickOne);
      expect(result[0].toNumber()).to.equal(4096);
      expect(result[1].toNumber()).to.equal(16 + 2048);
   })


   it("bookmark multiple across", async() => {
      let tickOne = -120 * 256 * 256 + 12 * 256 + 4
      let tickTwo = -120 * 256 * 256 + 12 * 256 + 11
      let tickThree =  -120 * 256 * 256 + 6 * 256 + 15;
      let tickFour =  -118 * 256 * 256 + 6 * 256 + 10;
      
      await census.testBookmark(tickOne);
      await census.testBookmark(tickTwo);
      await census.testBookmark(tickThree);
      await census.testBookmark(tickFour);
      
      let result = await census.getBitmaps(tickOne);
      expect(result[0].toNumber()).to.equal(4096 + 64);
      expect(result[1].toNumber()).to.equal(16 + 2048);

      result = await census.getBitmaps(tickThree);
      expect(result[0].toNumber()).to.equal(4096 + 64);
      expect(result[1].toNumber()).to.equal(32768);

      result = await census.getBitmaps(tickFour);
      expect(result[0].toNumber()).to.equal(64);
      expect(result[1].toNumber()).to.equal(1024);
   })


   it("forget reset", async() => {
      let tickOne = -120 * 256 * 256 + 12 * 256 + 4
      await census.testBookmark(tickOne);
      await census.testForget(tickOne);
      
      let result = await census.getBitmaps(tickOne);
      expect(result[0].toNumber()).to.equal(0);
      expect(result[1].toNumber()).to.equal(0);
   })
   
   it("forget repeat", async() => {
      let tickOne = -120 * 256 * 256 + 12 * 256 + 4
      await census.testBookmark(tickOne);
      await census.testForget(tickOne);
      await census.testForget(tickOne);
      
      let result = await census.getBitmaps(tickOne);
      expect(result[0].toNumber()).to.equal(0);
      expect(result[1].toNumber()).to.equal(0);
   })

   it("forget shared", async() => {
      let tickOne = -120 * 256 * 256 + 12 * 256 + 4
      let tickTwo = -120 * 256 * 256 + 12 * 256 + 11
      await census.testBookmark(tickOne);
      await census.testBookmark(tickTwo);
      await census.testForget(tickOne);
      
      let result = await census.getBitmaps(tickTwo);
      expect(result[0].toNumber()).to.equal(4096);
      expect(result[1].toNumber()).to.equal(2048);
   })


   it("forget multiple across", async() => {
      let tickOne = -120 * 256 * 256 + 12 * 256 + 4
      let tickThree =  -120 * 256 * 256 + 6 * 256 + 15;
      let tickFour =  -118 * 256 * 256 + 6 * 256 + 10;
      
      await census.testBookmark(tickOne);
      await census.testBookmark(tickThree);
      await census.testBookmark(tickFour);
      await census.testForget(tickOne);

      let result = await census.getBitmaps(tickOne);
      expect(result[0].toNumber()).to.equal(64);
      expect(result[1].toNumber()).to.equal(0);

      await census.testForget(tickThree);
      result = await census.getBitmaps(tickThree);
      expect(result[0].toNumber()).to.equal(0);
      expect(result[1].toNumber()).to.equal(0);

      await census.testForget(tickFour);
      result = await census.getBitmaps(tickFour);
      expect(result[0].toNumber()).to.equal(0);
      expect(result[1].toNumber()).to.equal(0);
   })


   it("pin buy", async() => {
      let tickRoot = -120 * 256 * 256 + 12 * 256
      let tick = tickRoot + 4
      let bitmap = 4 + 16 + 2048 + 8192;
      let result = await census.testPinBuy(tick, bitmap);
      expect(result[1]).to.equal(false);
      expect(result[0]).to.equal(tickRoot + 11);
   })

   it("pin sell", async() => {
      let tickRoot = -120 * 256 * 256 + 12 * 256
      let tick = tickRoot + 7
      let bitmap = 8 + 16 + 2048 + 8192;
      let result = await census.testPinSell(tick, bitmap);
      expect(result[1]).to.equal(false);
      expect(result[0]).to.equal(tickRoot + 4);
   })

   it("pin sell at", async() => {
      let tickRoot = -120 * 256 * 256 + 12 * 256
      let tick = tickRoot + 4
      let bitmap = 8 + 16 + 2048 + 8192;
      let result = await census.testPinSell(tick, bitmap);
      expect(result[1]).to.equal(false);
      expect(result[0]).to.equal(tickRoot + 4);
   })

   it("pin edge", async() => {
      let tickRoot = -120 * 256 * 256 + 12 * 256
      let tick = tickRoot + 2
      let bitmap = 8 + 16 + 2048 + 8192;
      let result = await census.testPinSell(tick, bitmap);
      expect(result[1]).to.equal(true);
      expect(result[0]).to.equal(tickRoot);
   })

   it("pin edge barrier", async() => {
      let tickRoot = -120 * 256 * 256 + 12 * 256
      let tick = tickRoot + 2
      let bitmap = 1 + 8 + 16 + 2048 + 8192;
      let result = await census.testPinSell(tick, bitmap);
      expect(result[1]).to.equal(false);
      expect(result[0]).to.equal(tickRoot);
   })

   it("pin buy spill", async() => {
      let tick = -120 * 256 * 256 + 12 * 256 + 4
      let bitmap = 4 + 16;
      let result = await census.testPinBuy(tick, bitmap);
      expect(result[1]).to.equal(true);
      expect(result[0]).to.equal(-120 * 256 * 256 + 13 * 256);
   })

   it("pin sell spill", async() => {
      let tick = -120 * 256 * 256 + 12 * 256 + 4
      let bitmap = 32 + 2048 + 8192;
      let result = await census.testPinSell(tick, bitmap);
      expect(result[1]).to.equal(true);
      expect(result[0]).to.equal(-120 * 256 * 256 + 12 * 256);
   })

   it("pin buy zero point", async() => {
      let tick = 127 * 256 * 256 + 255 * 256 + 4
      let bitmap = 4 + 16;
      let result = await census.testPinBuy(tick, bitmap);
      expect(result[1]).to.equal(true);
      expect(result[0]).to.equal(TICK_MAX);
   })

   it("pin sell zero point", async() => {
      let tick = -128 * 256 * 256 + 0 * 256 + 3
      let bitmap = 16 + 2048 + 8192;
      let result = await census.testPinSell(tick, bitmap);
      expect(result[1]).to.equal(true);
      expect(result[0]).to.equal(TICK_MIN);
   })

   it("seek empty", async() => {
      let tick = -120 * 256 * 256 + 12 * 256 + 4;
      let resultBuy = await census.testSeekBuy(tick);
      let resultSell = await census.testSeekSell(tick);
      expect(resultBuy[0]).to.equal(TICK_MAX);
      expect(resultSell[0]).to.equal(TICK_MIN);
      expect(resultBuy[1].toNumber()).to.equal(0);
      expect(resultSell[1].toNumber()).to.equal(0);      
   })

   async function populateTicks() {
      let tickOne = -120 * 256 * 256 + 12 * 256 + 4
      let tickTwo = -120 * 256 * 256 + 12 * 256 + 11
      let tickThree = -120 * 256 * 256 + 6 * 256 + 15;
      let tickFour = -118 * 256 * 256 + 6 * 256 + 10;
      let tickFive = -120 * 256 * 256 + 6 * 256 + 10
      await census.testBookmark(tickOne);
      await census.testBookmark(tickTwo);
      await census.testBookmark(tickThree);
      await census.testBookmark(tickFour);
      await census.testBookmark(tickFive);
   }

   it("seek over cliff", async() => {
      await populateTicks()
      let buyEdgeTick = -117 * 256 * 256;
      let sellEdgeTick = -121 * 256 * 256 + 255 * 256;
      let resultBuy = await census.testSeekBuy(buyEdgeTick);
      let resultSell = await census.testSeekSell(sellEdgeTick);
      expect(resultBuy[0]).to.equal(TICK_MAX);
      expect(resultSell[0]).to.equal(TICK_MIN);
      expect(resultBuy[1].toNumber()).to.equal(0);
      expect(resultSell[1].toNumber()).to.equal(0); 
   });

   it("seek terminus neighbor", async() => {
      await populateTicks()
      let leftTick = -120 * 256 * 256 + 7 * 256;
      let rightTick = -120 * 256 * 256 + 12 * 256;
      let resultBuy = await census.testSeekBuy(rightTick);
      let resultSell = await census.testSeekSell(leftTick);
      expect(resultBuy[0]).to.equal(-120 * 256 * 256 + 12 * 256 + 4);
      expect(resultSell[0]).to.equal(-120 * 256 * 256 + 6 * 256 + 15);
   });

   it("seek immediate neighbor", async() => {
      await populateTicks()
      await census.testBookmark(-120*256*256 + 6*256 + 255);
      await census.testBookmark(-120*256*256 + 12*256);
      let leftTick = -120 * 256 * 256 + 7 * 256;
      let rightTick = -120 * 256 * 256 + 12 * 256;
      let resultBuy = await census.testSeekBuy(rightTick);
      let resultSell = await census.testSeekSell(leftTick);
      expect(resultBuy[0]).to.equal(-120 * 256 * 256 + 12 * 256);
      expect(resultSell[0]).to.equal(-120 * 256 * 256 + 6 * 256 + 255);
   });

   it("seek through mezz", async() => {
      await populateTicks()
      let leftTick = -120 * 256 * 256 + 18 * 256;
      let rightTick = -120 * 256 * 256 + 3 * 256;
      let resultBuy = await census.testSeekBuy(rightTick);
      let resultSell = await census.testSeekSell(leftTick);
      expect(resultBuy[0]).to.equal(-120 * 256 * 256 + 6 * 256 + 10);
      expect(resultSell[0]).to.equal(-120 * 256 * 256 + 12 * 256 + 11);
      expect(resultBuy[1].toNumber()).to.equal(32768 + 1024);
      expect(resultSell[1].toNumber()).to.equal(2064); 
   });

   it("seek immediate mezz", async() => {
      await populateTicks()
      let leftTick = -120 * 256 * 256 + 13 * 256;
      let rightTick = -120 * 256 * 256 + 5 * 256;
      let resultBuy = await census.testSeekBuy(rightTick);
      let resultSell = await census.testSeekSell(leftTick);
      expect(resultBuy[0]).to.equal(-120 * 256 * 256 + 6 * 256 + 10);
      expect(resultSell[0]).to.equal(-120 * 256 * 256 + 12 * 256 + 11);
      expect(resultBuy[1].toNumber()).to.equal(32768 + 1024);
      expect(resultSell[1].toNumber()).to.equal(2064); 
   });

   it("seek mezz caged", async() => {
      await populateTicks()
      let tick = -120 * 256 * 256 + 10 * 256;
      let resultBuy = await census.testSeekBuy(tick);
      let resultSell = await census.testSeekSell(tick);
      expect(resultBuy[0]).to.equal(-120 * 256 * 256 + 12 * 256 + 4);
      expect(resultSell[0]).to.equal(-120 * 256 * 256 + 6 * 256 + 15);
      expect(resultBuy[1].toNumber()).to.equal(2064);
      expect(resultSell[1].toNumber()).to.equal(32768 + 1024); 
   });

   it("seek mezz inner caged", async() => {
      await populateTicks()
      await census.testBookmark(-120 * 256 * 256 + 11 * 256 + 132)
      await census.testBookmark(-120 * 256 * 256 + 11 * 256 + 103)
      await census.testBookmark(-120 * 256 * 256 + 7 * 256 + 42)
      await census.testBookmark(-120 * 256 * 256 + 7 * 256 + 212)
      let tick = -120 * 256 * 256 + 9 * 256;
      let resultBuy = await census.testSeekBuy(tick);
      let resultSell = await census.testSeekSell(tick);
      expect(resultBuy[0]).to.equal(-120 * 256 * 256 + 11 * 256 + 103);
      expect(resultSell[0]).to.equal(-120 * 256 * 256 + 7 * 256 + 212);
   });

   it("seek through lobby", async() => {
      await populateTicks()
      let leftTick = -117 * 256 * 256 + 128 * 256;
      let rightTick = -121 * 256 * 256 + 128 * 256;
      let resultBuy = await census.testSeekBuy(rightTick);
      let resultSell = await census.testSeekSell(leftTick);
      expect(resultBuy[0]).to.equal(-120 * 256 * 256 + 6 * 256 + 10);
      expect(resultSell[0]).to.equal(-118 * 256 * 256 + 6 * 256 + 10);
      expect(resultBuy[1].toNumber()).to.equal(32768 + 1024);
      expect(resultSell[1].toNumber()).to.equal(1024); 
   });

   it("seek lobby lookback", async() => {
      await census.testBookmark(-1 * 256 * 256 + 236 * 256 + 120)
      await census.testBookmark(0 * 256 * 256 + 31 * 256 + 64);
      let buyBorder = 0 * 256 * 256 + 15 * 256 + 255 + 1
      let sellBorder = 0 * 256 * 256 + 15 * 256 + 0 - 1
      let resultBuy = await census.testSeekBuy(buyBorder)
      let resultSell = await census.testSeekSell(sellBorder)

      expect(resultBuy[0]).to.equal(0 * 256 * 256 + 31 * 256 + 64);
      expect(resultSell[0]).to.equal(-1 * 256 * 256 + 236 * 256 + 120);
   })

   it("seek lobby lookback reverse", async() => {
      await census.testBookmark(0 * 256 * 256 + 10 * 256 + 120)
      await census.testBookmark(1 * 256 * 256 + 31 * 256 + 64);
      let buyBorder = 0 * 256 * 256 + 15 * 256 + 255 + 1
      let sellBorder = 0 * 256 * 256 + 15 * 256 + 0 - 1
      let resultBuy = await census.testSeekBuy(buyBorder)
      let resultSell = await census.testSeekSell(sellBorder)

      expect(resultBuy[0]).to.equal(1 * 256 * 256 + 31 * 256 + 64);
      expect(resultSell[0]).to.equal(0 * 256 * 236 + 10 * 256 + 120);
   })
})
