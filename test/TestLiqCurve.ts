import { TestLiquidityCurve } from '../typechain/TestLiquidityCurve'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, toFixedGrowth, fromSqrtPrice, fromFixedGrowth } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";

chai.use(solidity);

describe('LiquidityCurve', () => {
   let curve: TestLiquidityCurve

   beforeEach("deploy contract", async () => {
      const factory = await ethers.getContractFactory("TestLiquidityCurve");
      curve = (await factory.deploy()) as TestLiquidityCurve;
   })

   const COLLATERAL_ROUND = 4

   it("liquidity receive ambient", async () => {
      await curve.fixCurve(1, toSqrtPrice(2.25), 6000, 10000);
      await curve.fixAccum(1, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testLiqRecAmb(1, 1500);
      
      expect(await curve.baseFlow()).to.equal(3937 + COLLATERAL_ROUND);
      expect(await curve.quoteFlow()).to.equal(1750 + COLLATERAL_ROUND);
      expect((await curve.pullTotalLiq(1)).toNumber()).to.eq(23125);

      let state = await curve.pullCurve(1);
      expect(fromSqrtPrice(state.priceRoot_)).to.equal(2.25)
      expect(state.ambientSeeds_.toNumber()).to.equal(7500)
      expect(state.concLiq_.toNumber()).to.equal(10000);
      expect(fromFixedGrowth(state.seedDeflator_)).to.equal(0.75);
      expect(fromFixedGrowth(state.concGrowth_)).to.equal(2.5);
   })

   it("liquidity pay ambient", async () => {
      await curve.fixCurve(0, toSqrtPrice(2.25), 6000, 10000);
      await curve.fixAccum(0, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testLiqPayAmb(0, 1500);
      
      expect(await curve.baseFlow()).to.equal(3937);
      expect(await curve.quoteFlow()).to.equal(1750);
      expect((await curve.pullTotalLiq(0)).toNumber()).to.eq(17875);

      let state = await curve.pullCurve(0);
      expect(fromSqrtPrice(state.priceRoot_)).to.equal(2.25)
      expect(state.ambientSeeds_.toNumber()).to.equal(4500)
      expect(state.concLiq_.toNumber()).to.equal(10000);
      expect(fromFixedGrowth(state.seedDeflator_)).to.equal(0.75);
      expect(fromFixedGrowth(state.concGrowth_)).to.equal(2.5);
   })

   it("liquidity receive concentrated", async () => {
      await curve.fixCurve(5, toSqrtPrice(2.25), 6000, 10000);
      await curve.fixAccum(5, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testLiqRecConc(5, 1500, toSqrtPrice(1.96), toSqrtPrice(2.89));
      
      expect(await curve.baseFlow()).to.equal(150 + COLLATERAL_ROUND);
      expect(await curve.quoteFlow()).to.equal(117 + COLLATERAL_ROUND);
      expect((await curve.pullTotalLiq(5)).toNumber()).to.lte(22000);

      let state = await curve.pullCurve(5);
      expect(fromSqrtPrice(state.priceRoot_)).to.equal(2.25)
      expect(state.ambientSeeds_.toNumber()).to.equal(6000)
      expect(state.concLiq_.toNumber()).to.equal(11500);
      expect(fromFixedGrowth(state.seedDeflator_)).to.equal(0.75);
      expect(fromFixedGrowth(state.concGrowth_)).to.equal(2.5);
   })

   it("liquidity pay concentrated", async () => {
      await curve.fixCurve(3, toSqrtPrice(2.25), 6000, 10000);
      await curve.fixAccum(3, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testLiqPayConc(3, 1500, toSqrtPrice(1.96), toSqrtPrice(2.89), 0);
      
      expect(await curve.baseFlow()).to.equal(150);
      expect(await curve.quoteFlow()).to.equal(117);
      expect((await curve.pullTotalLiq(3)).toNumber()).to.eq(19000);

      let state = await curve.pullCurve(3);
      expect(fromSqrtPrice(state.priceRoot_)).to.equal(2.25)
      expect(state.ambientSeeds_.toNumber()).to.equal(6000)
      expect(state.concLiq_.toNumber()).to.equal(8500);
      expect(fromFixedGrowth(state.seedDeflator_)).to.equal(0.75);
      expect(fromFixedGrowth(state.concGrowth_)).to.equal(2.5);
   })

   it("multiple pools", async () => {
      await curve.fixCurve(2, toSqrtPrice(1.5625), 4000, 8000);
      await curve.fixAccum(2, toFixedGrowth(1.5), toFixedGrowth(3.5));
      await curve.fixCurve(3, toSqrtPrice(2.25), 6000, 10000);
      await curve.fixAccum(3, toFixedGrowth(0.75), toFixedGrowth(2.5));
      
      await curve.testLiqPayConc(2, 6000, toSqrtPrice(1.44), toSqrtPrice(1.69), 0);
      expect(await curve.baseFlow()).to.equal(300);
      expect(await curve.quoteFlow()).to.equal(184);
      expect((await curve.pullTotalLiq(2)).toNumber()).to.eq(12000);

      await curve.testLiqPayConc(3, 1500, toSqrtPrice(1.96), toSqrtPrice(2.89), 0);      
      expect(await curve.baseFlow()).to.equal(150);
      expect(await curve.quoteFlow()).to.equal(117);
      expect((await curve.pullTotalLiq(3)).toNumber()).to.eq(19000);

      let state = await curve.pullCurve(2);
      expect(fromSqrtPrice(state.priceRoot_)).to.equal(1.5625)
      expect(state.ambientSeeds_.toNumber()).to.equal(4000)
      expect(state.concLiq_.toNumber()).to.equal(2000);
      expect(fromFixedGrowth(state.seedDeflator_)).to.equal(1.5);
      expect(fromFixedGrowth(state.concGrowth_)).to.equal(3.5);

      state = await curve.pullCurve(3);
      expect(fromSqrtPrice(state.priceRoot_)).to.equal(2.25)
      expect(state.ambientSeeds_.toNumber()).to.equal(6000)
      expect(state.concLiq_.toNumber()).to.equal(8500);
      expect(fromFixedGrowth(state.seedDeflator_)).to.equal(0.75);
      expect(fromFixedGrowth(state.concGrowth_)).to.equal(2.5);
   })

   it("liquidity below range", async () => {
      await curve.fixCurve(6, toSqrtPrice(2.25), 6000, 10000);
      await curve.fixAccum(6, toFixedGrowth(0.75), toFixedGrowth(2.5));

      await curve.testLiqRecConc(6, 3000, toSqrtPrice(1.44), toSqrtPrice(1.96));
      expect(await curve.baseFlow()).to.equal(600 + 3);
      expect(await curve.quoteFlow()).to.equal(0);
      expect((await curve.pullTotalLiq(6)).toNumber()).to.eq(20500);

      await curve.testLiqPayConc(6, 1500, toSqrtPrice(1.44), toSqrtPrice(1.96), 0);
      expect(await curve.baseFlow()).to.equal(299);
      expect(await curve.quoteFlow()).to.equal(0);
      expect((await curve.pullTotalLiq(6)).toNumber()).to.eq(20500);

      let state = await curve.pullCurve(6);
      expect(fromSqrtPrice(state.priceRoot_)).to.equal(2.25)
      expect(state.ambientSeeds_.toNumber()).to.equal(6000)
      expect(state.concLiq_.toNumber()).to.equal(10000);
   })

   it("liquidity above range", async () => {
      await curve.fixCurve(8, toSqrtPrice(2.25), 6000, 10000);
      await curve.fixAccum(8, toFixedGrowth(0.75), toFixedGrowth(2.5));
     
      await curve.testLiqRecConc(8, 3000, toSqrtPrice(4), toSqrtPrice(6.25));
      expect(await curve.baseFlow()).to.equal(0);
      expect(await curve.quoteFlow()).to.equal(300 + 3);
      expect((await curve.pullTotalLiq(8)).toNumber()).to.eq(20500);

      await curve.testLiqPayConc(8, 1500, toSqrtPrice(4), toSqrtPrice(6.25), 0); 
      expect(await curve.baseFlow()).to.equal(0);
      expect(await curve.quoteFlow()).to.equal(149);
      expect((await curve.pullTotalLiq(8)).toNumber()).to.eq(20500);

      let state = await curve.pullCurve(8);
      expect(fromSqrtPrice(state.priceRoot_)).to.equal(2.25)
      expect(state.ambientSeeds_.toNumber()).to.equal(6000)
      expect(state.concLiq_.toNumber()).to.equal(10000);
   })


   it("liquidity below range", async () => {
      await curve.fixCurve(0, toSqrtPrice(2.25), 6000, 10000);
      await curve.fixAccum(0, toFixedGrowth(0.75), toFixedGrowth(2.5));

      await curve.testLiqRecConc(0, 3000, toSqrtPrice(1.44), toSqrtPrice(1.96));
      expect(await curve.baseFlow()).to.equal(600 + 3);
      expect(await curve.quoteFlow()).to.equal(0);
      expect((await curve.pullTotalLiq(0)).toNumber()).to.eq(20500);

      await curve.testLiqPayConc(0, 1500, toSqrtPrice(1.44), toSqrtPrice(1.96), 0);
      expect(await curve.baseFlow()).to.equal(299);
      expect(await curve.quoteFlow()).to.equal(0);
      expect((await curve.pullTotalLiq(0)).toNumber()).to.eq(20500);

      let state = await curve.pullCurve(0);
      expect(fromSqrtPrice(state.priceRoot_)).to.equal(2.25)
      expect(state.ambientSeeds_.toNumber()).to.equal(6000)
      expect(state.concLiq_.toNumber()).to.equal(10000);
   })

   it("liquidity on lower bump", async () => {
      await curve.fixCurve(1, toSqrtPrice(1.0), 6000, 10000);
      await curve.fixAccum(1, toFixedGrowth(0.75), toFixedGrowth(2.5));
     
      await curve.testLiqRecTicks(1, 3000, 0, 1000);
      expect(await curve.baseFlow()).to.equal(4); // Since price is actually in range, we pay the knock-in buffer
      expect(await curve.quoteFlow()).to.equal(150);
      expect((await curve.pullTotalLiq(1)).toNumber()).to.eq(23500);

      await curve.testLiqPayTicks(1, 3000, 0, 1000);
      expect(await curve.baseFlow()).to.equal(0);
      expect(await curve.quoteFlow()).to.equal(146);
      expect((await curve.pullTotalLiq(1)).toNumber()).to.eq(20500);
   })

   it("liquidity on lower bump wei", async () => {
      await curve.fixCurve(1, toSqrtPrice(1.0).sub(1), 6000, 10000);
      await curve.fixAccum(1, toFixedGrowth(0.75), toFixedGrowth(2.5));
     
      await curve.testLiqRecTicks(1, 3000, 0, 1000);
      expect(await curve.baseFlow()).to.equal(0);
      expect(await curve.quoteFlow()).to.equal(150);
      expect((await curve.pullTotalLiq(1)).toNumber()).to.eq(20500);

      await curve.testLiqPayTicks(1, 3000, 0, 1000);
      expect(await curve.baseFlow()).to.equal(0);
      expect(await curve.quoteFlow()).to.equal(146);
      expect((await curve.pullTotalLiq(1)).toNumber()).to.eq(20500);
   })

   it("liquidity on upper bump", async () => {
      await curve.fixCurve(2, toSqrtPrice(1.0), 6000, 10000);
      await curve.fixAccum(2, toFixedGrowth(0.75), toFixedGrowth(2.5));

      await curve.testLiqRecTicks(2, 3000, -1000, 0);
      expect(await curve.baseFlow()).to.equal(150);
      expect(await curve.quoteFlow()).to.equal(0);
      expect((await curve.pullTotalLiq(2)).toNumber()).to.lte(20500);

      await curve.testLiqPayTicks(2, 3000, -1000, 0);
      expect(await curve.baseFlow()).to.equal(146);
      expect(await curve.quoteFlow()).to.equal(0);
      expect((await curve.pullTotalLiq(2)).toNumber()).to.lte(20500);
   })

   it("liquidity on upper bump wei", async () => {
      await curve.fixCurve(2, toSqrtPrice(1.0).sub(1), 6000, 10000);
      await curve.fixAccum(2, toFixedGrowth(0.75), toFixedGrowth(2.5));

      await curve.testLiqRecTicks(2, 3000, -1000, 0);
      expect(await curve.baseFlow()).to.equal(150);
      expect(await curve.quoteFlow()).to.equal(4); // Since price is actually in range, we pay the knock-in buffer
      expect((await curve.pullTotalLiq(2)).toNumber()).to.lte(23500);

      await curve.testLiqPayTicks(2, 3000, -1000, 0);
      expect(await curve.baseFlow()).to.equal(146);
      expect(await curve.quoteFlow()).to.equal(0);
      expect((await curve.pullTotalLiq(2)).toNumber()).to.lte(20500);
   })

   it("liquidity inside tick", async () => {
      await curve.fixCurve(0, toSqrtPrice(1.00005), 6000, 10000);
      await curve.fixAccum(0, toFixedGrowth(0.75), toFixedGrowth(2.5));
     
      await curve.testLiqRecTicks(0, 3000, 0, 1000);
      expect((await curve.pullTotalLiq(0)).toNumber()).to.eq(23500);

      await curve.testLiqRecTicks(0, 3000, 1, 1000);
      expect((await curve.pullTotalLiq(0)).toNumber()).to.eq(23500);

      await curve.testLiqRecTicks(0, 3000, -1000, 0);
      expect((await curve.pullTotalLiq(0)).toNumber()).to.eq(23500);

      await curve.testLiqRecTicks(0, 3000, -1000, 1);
      expect((await curve.pullTotalLiq(0)).toNumber()).to.eq(26500);
   })

   it("liquidity rewards", async () => {
      await curve.fixCurve(6, toSqrtPrice(2.25), 6000, 10000);
      await curve.fixAccum(6, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testLiqPayConc(6, 1500, toSqrtPrice(4), toSqrtPrice(6.25), 
         toFixedGrowth(0.8));
      
      expect(await curve.baseFlow()).to.equal(3147);
      expect(await curve.quoteFlow()).to.equal(149 + 1398);
      expect((await curve.pullTotalLiq(6)).toNumber()).to.lte(19400);

      let state = await curve.pullCurve(6);
      expect(fromSqrtPrice(state.priceRoot_)).to.equal(2.25)
      expect(state.ambientSeeds_.toNumber()).to.equal(4801)
      expect(state.concLiq_.toNumber()).to.equal(10000);
   })

})
