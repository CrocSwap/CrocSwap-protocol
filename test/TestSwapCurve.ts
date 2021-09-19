import { TestLiquidityCurve } from '../typechain/TestLiquidityCurve'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, toFixedGrowth, fromSqrtPrice, fromFixedGrowth, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { BigNumber } from 'ethers';

chai.use(solidity);

describe('Swap Curve', () => {
   let curve: TestLiquidityCurve

   beforeEach("deploy contract", async () => {
      const factory = await ethers.getContractFactory("TestLiquidityCurve");
      curve = (await factory.deploy()) as TestLiquidityCurve;
   })

   const COLLATERAL_ROUND = 4;

   it("swap full qty", async() => {
      let swapCntx = { isBuy_: true, inBaseQty_: true, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 1000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(0, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(0, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(0, swap, toSqrtPrice(3), toSqrtPrice(4.5))

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(0);
      expect(accum.paidBase_.toNumber()).to.equal(1000000);
      expect(accum.paidQuote_.toNumber()).to.equal(-430446 + COLLATERAL_ROUND);
      expect(accum.paidProto_.toNumber()).to.equal(0);

      let state = await curve.pullCurve(0);
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(2.398721)
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(2.398720)
      expect(state.liq_.ambientSeed_.toNumber()).to.equal(6000000)
      expect(state.liq_.concentrated_.toNumber()).to.equal(10000000);
      expect(fromFixedGrowth(state.accum_.ambientGrowth_)).to.equal(0.75);
      expect(fromFixedGrowth(state.accum_.concTokenGrowth_)).to.equal(2.5);
   })

   it("swap fee full qty", async() => {
      let swapCntx = { isBuy_: true, inBaseQty_: true, feeRate_: 50000, protoCut_: 0}
      let swap = { qtyLeft_: 1000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(1, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(1, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(1, swap, toSqrtPrice(9), toSqrtPrice(9))

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(0);
      expect(accum.paidBase_.toNumber()).to.equal(1000000);
      expect(accum.paidQuote_.toNumber()).to.equal(-409602 + COLLATERAL_ROUND);
      expect(accum.paidProto_.toNumber()).to.equal(0);

      let state = await curve.pullCurve(1);
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(2.39490)
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(2.39495)
      expect(state.liq_.ambientSeed_.toNumber()).to.equal(6004493)
      expect(state.liq_.concentrated_.toNumber()).to.equal(10000000);
      expect(fromFixedGrowth(state.accum_.ambientGrowth_)).to.gte(0.75 + 0.001377);
      expect(fromFixedGrowth(state.accum_.ambientGrowth_)).to.lte(0.75 + 0.001378);
      expect(fromFixedGrowth(state.accum_.concTokenGrowth_)).to.gte(2.5 + 0.0004492);
      expect(fromFixedGrowth(state.accum_.concTokenGrowth_)).to.lte(2.5 + 0.0004493);
   })

   it("swap fee+proto full qty", async() => {
      let swapCntx = { isBuy_: true, inBaseQty_: true, feeRate_: 50000, protoCut_: 5}
      let swap = { qtyLeft_: 1000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(5, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(5, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(5, swap, toSqrtPrice(9), toSqrtPrice(9))

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(0);
      expect(accum.paidBase_.toNumber()).to.equal(1000000);
      expect(accum.paidQuote_.toNumber()).to.equal(-409466 + COLLATERAL_ROUND);
      expect(accum.paidProto_.toNumber()).to.equal(4304);

      let state = await curve.pullCurve(5);
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(2.3957)
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(2.3958)
      expect(state.liq_.ambientSeed_.toNumber()).to.equal(6003595)
      expect(state.liq_.concentrated_.toNumber()).to.equal(10000000);
      expect(fromFixedGrowth(state.accum_.ambientGrowth_)).to.lte(0.75 + 0.00110196);
      expect(fromFixedGrowth(state.accum_.ambientGrowth_)).to.lte(0.75 + 0.00110197);
      expect(fromFixedGrowth(state.accum_.concTokenGrowth_)).to.lte(2.5 + 0.00035950);
      expect(fromFixedGrowth(state.accum_.concTokenGrowth_)).to.gte(2.5 + 0.00035949);
   })

   it("swap paid cumulative", async() => {
      let swapCntx = { isBuy_: true, inBaseQty_: true, feeRate_: 50000, protoCut_: 5}
      let swap = { qtyLeft_: 1000000, paidQuote_: -100000, paidBase_: 300000, paidProto_: 10000, cntx_: swapCntx}
      await curve.fixCurve(3, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(3, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(3, swap, toSqrtPrice(9), toSqrtPrice(9))

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(0);
      expect(accum.paidBase_.toNumber()).to.equal(1300000);
      expect(accum.paidQuote_.toNumber()).to.equal(-509466 + COLLATERAL_ROUND);
      expect(accum.paidProto_.toNumber()).to.equal(14304);
   })

   it("swap sell", async() => {
      let swapCntx = { isBuy_: false, inBaseQty_: true, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 1000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(7, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(7, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(7, swap, toSqrtPrice(0.1), toSqrtPrice(0.05))

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(0);
      expect(accum.paidBase_.toNumber()).to.equal(-1000000);
      expect(accum.paidQuote_.toNumber()).to.equal(459383 + COLLATERAL_ROUND);

      let state = await curve.pullCurve(7);
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(2.106039)
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(2.106038)
   })

   it("swap sell fee", async() => {
      let swapCntx = { isBuy_: false, inBaseQty_: true, feeRate_: 50000, protoCut_: 4}
      let swap = { qtyLeft_: 1000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(3, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(3, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(3, swap, toSqrtPrice(0.1), toSqrtPrice(0.05))

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(0);
      expect(accum.paidBase_.toNumber()).to.equal(-1000000);
      expect(accum.paidQuote_.toNumber()).to.equal(482931 + COLLATERAL_ROUND);
      expect(accum.paidProto_.toNumber()).to.equal(5742);

      let state = await curve.pullCurve(3);
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(2.103387)
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(2.103386)
   })

   it("swap quote denom", async() => {
      let swapCntx = { isBuy_: true, inBaseQty_: false, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 1000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(8, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(8, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(8, swap, toSqrtPrice(3), toSqrtPrice(4.5))

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(0);
      expect(accum.paidBase_.toNumber()).to.equal(2427631 + COLLATERAL_ROUND);
      expect(accum.paidQuote_.toNumber()).to.equal(-1000000);

      let state = await curve.pullCurve(8);
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(2.619287)
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(2.619286)
   })

   it("swap quote denom fees", async() => {
      let swapCntx = { isBuy_: true, inBaseQty_: false, feeRate_: 50000, protoCut_: 4}
      let swap = { qtyLeft_: 1000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(1, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(1, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(1, swap, toSqrtPrice(3), toSqrtPrice(4.5))

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(0);
      expect(accum.paidBase_.toNumber()).to.equal(2556199 + COLLATERAL_ROUND);
      expect(accum.paidQuote_.toNumber()).to.equal(-1000000);
      expect(accum.paidProto_.toNumber()).to.equal(30345);

      let state = await curve.pullCurve(1);
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(2.62705)
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(2.62704)
   })

   it("swap quote sell", async() => {
      let swapCntx = { isBuy_: false, inBaseQty_: false, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 1000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(0, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(0, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(0, swap, toSqrtPrice(0.1), toSqrtPrice(0.05))

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(0);
      expect(accum.paidBase_.toNumber()).to.equal(-2096590 + COLLATERAL_ROUND);
      expect(accum.paidQuote_.toNumber()).to.equal(1000000);

      let state = await curve.pullCurve(0);
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(1.953642)
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(1.953641)
   })

   it("swap quote sell fee", async() => {
      let swapCntx = { isBuy_: false, inBaseQty_: false, feeRate_: 50000, protoCut_: 4}
      let swap = { qtyLeft_: 1000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(1, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(1, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(1, swap, toSqrtPrice(0.1), toSqrtPrice(0.05))

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(0);
      expect(accum.paidBase_.toNumber()).to.equal(-1997122 + COLLATERAL_ROUND);
      expect(accum.paidQuote_.toNumber()).to.equal(1000000);
      expect(accum.paidProto_.toNumber()).to.equal(26207);

      let state = await curve.pullCurve(1);
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(1.958637)
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(1.958636)
   })

   it("swap bump price", async() => {
      let swapCntx = { isBuy_: true, inBaseQty_: true, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 2000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(3, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(3, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(3, swap, toSqrtPrice(2.4025), toSqrtPrice(3))

      let state = await curve.pullCurve(3);
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(2.4025)
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(2.4023)

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(975853 - COLLATERAL_ROUND);
      expect(accum.paidBase_.toNumber()).to.equal(1024147 + COLLATERAL_ROUND);
      expect(accum.paidQuote_.toNumber()).to.equal(-440505 + COLLATERAL_ROUND);
   })

   it("swap bump sell", async() => {
      let swapCntx = { isBuy_: false, inBaseQty_: false, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 200000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(4, toSqrtPrice(2.25), 600000, 1000000);
      await curve.fixAccum(4, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(4, swap, toSqrtPrice(1.96), toSqrtPrice(1.5))

      // Corresponds to the closest bump tick to 1.96
      let state = await curve.pullCurve(4);
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(1.959846)
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(1.959848)

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(102324 - COLLATERAL_ROUND);
      expect(accum.paidBase_.toNumber()).to.equal(-205112 + COLLATERAL_ROUND);
      expect(accum.paidQuote_.toNumber()).to.equal(97676 + COLLATERAL_ROUND);
   })

   it("swap bump denom", async() => {
      let swapCntx = { isBuy_: false, inBaseQty_: true, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 1000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(3, toSqrtPrice(2.25), 600000, 1000000);
      await curve.fixAccum(3, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(3, swap, toSqrtPrice(1.96), toSqrtPrice(1.5))

      // Corresponds to the closest bump tick to 1.96
      let state = await curve.pullCurve(3);
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(1.959846)
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(1.959848)

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(794888 + COLLATERAL_ROUND);
      expect(accum.paidBase_.toNumber()).to.equal(-205112 + COLLATERAL_ROUND);
      expect(accum.paidQuote_.toNumber()).to.equal(97676 + COLLATERAL_ROUND);
   })

   it("swap limit price", async() => {
      let swapCntx = { isBuy_: true, inBaseQty_: true, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 2000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(2, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(2, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(2, swap, toSqrtPrice(3), toSqrtPrice(2.4025))

      let state = await curve.pullCurve(2);
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(2.4025)
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(2.4023)

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(975001 - COLLATERAL_ROUND);
      expect(accum.paidBase_.toNumber()).to.equal(1024999 + COLLATERAL_ROUND);
      expect(accum.paidQuote_.toNumber()).to.equal(-440860 + COLLATERAL_ROUND);
   })

   it("swap limit fee", async() => {
      let swapCntx = { isBuy_: true, inBaseQty_: true, feeRate_: 50000, protoCut_: 0}
      let swap = { qtyLeft_: 2000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(1, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(1, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(1, swap, toSqrtPrice(3), toSqrtPrice(2.4025))

      let state = await curve.pullCurve(1);
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(2.4025)
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(2.4024)

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(949387 - COLLATERAL_ROUND);
      expect(accum.paidBase_.toNumber()).to.equal(1050613 + COLLATERAL_ROUND);
      expect(accum.paidQuote_.toNumber()).to.equal(-430197 + COLLATERAL_ROUND);
   })

   it("swap limit sell", async() => {
      let swapCntx = { isBuy_: false, inBaseQty_: false, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 2000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(6, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(6, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwap(6, swap, toSqrtPrice(1.5), toSqrtPrice(1.96))

      let state = await curve.pullCurve(6);
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(1.959999)
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(1.96)

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(1023810 - COLLATERAL_ROUND);
      expect(accum.paidBase_.toNumber()).to.equal(-2050000 + COLLATERAL_ROUND);
      expect(accum.paidQuote_.toNumber()).to.equal(976190 + COLLATERAL_ROUND);
   })

   it("swap bump infinity", async() => {
      let swapCntx = { isBuy_: true, inBaseQty_: true, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 2000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(6, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(6, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwapBumpInf(6, swap, toSqrtPrice(2.4025))

      let state = await curve.pullCurve(6);
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(2.4025)
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(2.4023)

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(975001 - COLLATERAL_ROUND);
      expect(accum.paidBase_.toNumber()).to.equal(1024999 + COLLATERAL_ROUND);
      expect(accum.paidQuote_.toNumber()).to.equal(-440860 + COLLATERAL_ROUND);
   })

   it("swap bump sell infinity", async() => {
      let swapCntx = { isBuy_: false, inBaseQty_: false, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 2000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(0, toSqrtPrice(2.25), 6000000, 10000000);
      await curve.fixAccum(0, toFixedGrowth(0.75), toFixedGrowth(2.5));
      await curve.testSwapBumpInf(0, swap, toSqrtPrice(1.96))

      let state = await curve.pullCurve(3);
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(1.959999)
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(1.96)

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(1023810 - COLLATERAL_ROUND);
      expect(accum.paidBase_.toNumber()).to.equal(-2050000 + COLLATERAL_ROUND);
      expect(accum.paidQuote_.toNumber()).to.equal(976190 + COLLATERAL_ROUND);
   })

   it("swap infinity", async() => {
      let swapCntx = { isBuy_: true, inBaseQty_: true, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 2000000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(0, toSqrtPrice(2.25), 10000, 0);
      await curve.testSwapLimitInf(0, swap)

      let state = await curve.pullCurve(0);
      expect(state.priceRoot_).to.eq(toSqrtPrice(200001.5 * 200001.5));

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(0);
      expect(accum.paidBase_.toNumber()).to.equal(2000000000);
      expect(accum.paidQuote_.toNumber()).to.equal(-6661);
   })

   it("swap infinity sell", async() => {
      let swapCntx = { isBuy_: false, inBaseQty_: true, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 2000000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(2, toSqrtPrice(2.25), 10000, 0);
      await curve.testSwapLimitInf(2, swap)

      let state = await curve.pullCurve(2);
      expect(state.priceRoot_).to.equal(minSqrtPrice());

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(1999985001 + COLLATERAL_ROUND);
      expect(accum.paidBase_.toNumber()).to.equal(-14999 + COLLATERAL_ROUND);
      expect(accum.paidQuote_).to.gte(100000000000);
   })

   it("swap infinity quote", async() => {
      let swapCntx = { isBuy_: true, inBaseQty_: false, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 2000000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(3, toSqrtPrice(2.25), 10000, 0);
      await curve.testSwapLimitInf(3, swap)

      let state = await curve.pullCurve(3);
      expect(state.priceRoot_).to.equal(maxSqrtPrice());

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(1999993335 + COLLATERAL_ROUND);
      expect(accum.paidBase_).to.gte(100000000000000);
      expect(accum.paidQuote_.toNumber()).to.equal(-6665 + COLLATERAL_ROUND);
   })

   it("swap infinity quote sell", async() => {
      let swapCntx = { isBuy_: false, inBaseQty_: false, feeRate_: 0, protoCut_: 0}
      let swap = { qtyLeft_: 2000000000, paidQuote_: 0, paidBase_: 0, paidProto_: 0, cntx_: swapCntx}
      await curve.fixCurve(1, toSqrtPrice(2.25), 10000, 0);
      await curve.testSwapLimitInf(1, swap)

      let rootPrice = 6666 * 1.5 / (swap.qtyLeft_ + 6666)
      let state = await curve.pullCurve(1);
      expect(fromSqrtPrice(state.priceRoot_)).to.gte(rootPrice-1e8)
      expect(fromSqrtPrice(state.priceRoot_)).to.lte(rootPrice+1e8)

      let accum = await curve.lastSwap();
      expect(accum.qtyLeft_.toNumber()).to.equal(0);
      expect(accum.paidBase_.toNumber()).to.equal(-14999 + COLLATERAL_ROUND);
      expect(accum.paidQuote_.toNumber()).to.equal(2000000000);
   })
})
