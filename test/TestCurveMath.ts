import { TestCurveMath } from '../typechain/TestCurveMath';
import { expect } from "chai";
import chai from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import { BigNumber } from 'ethers';
import { toFixedGrowth, toSqrtPrice, fromSqrtPrice, fromFixedGrowth, maxSqrtPrice, minSqrtPrice } from './FixedPoint';

chai.use(solidity);

describe('CurveMath', () => {
   let curve: TestCurveMath

   beforeEach("deploy", async () => {
      const libFactory = await ethers.getContractFactory("TestCurveMath");
      curve = (await libFactory.deploy()) as TestCurveMath;
   })

   it("active liquidity", async() => {
      let seed = 2500000;
      let conc = 6000000;
      let growth = toFixedGrowth(0.15);

      let liq = await curve.testActiveLiq(seed, growth, conc);
      expect(liq).within(8874999, 8875000);
   })

   it("limit calc", async() => {
      let limitOne = await curve.testLimitBase(toSqrtPrice(2.5), toSqrtPrice(0.75), 10000);
      let limitTwo = await curve.testLimitBase(toSqrtPrice(0.1), toSqrtPrice(0.25), 10000);
      let limitThree = await curve.testLimitQuote(toSqrtPrice(2.5), toSqrtPrice(4.5), 10000);
      let limitFour = await curve.testLimitQuote(toSqrtPrice(1024), toSqrtPrice(96), 10000);
      
      expect(limitOne).to.equal(7151);
      expect(limitTwo).to.equal(1837);
      expect(limitThree).to.equal(1610);
      expect(limitFour).to.equal(707);
   })

   it("limit exhaust qty", async() => {
      let limit = await curve.testLimitQtyLeft(toSqrtPrice(2.5), toSqrtPrice(0.75), 10000, 5000);
      expect(limit).to.equal(5000);
   })

   it("limit invert", async() => {
      let limitOne = await curve.testCounterBase(toSqrtPrice(2.5), toSqrtPrice(0.75), 10000);
      let limitTwo = await curve.testCounterBase(toSqrtPrice(0.1), toSqrtPrice(0.25), 10000);
      let limitThree = await curve.testCounterQuote(toSqrtPrice(2.5), toSqrtPrice(4.5), 10000);
      let limitFour = await curve.testCounterQuote(toSqrtPrice(1024), toSqrtPrice(96), 10000);
      
      expect(limitOne).to.equal(5223);
      expect(limitTwo).to.equal(11618);
      expect(limitThree).to.equal(5402);
      expect(limitFour).to.equal(221865);
   })

   it("limit invert exhaust qty", async() => {
      let limit = await curve.testCounterQtyLeft(toSqrtPrice(2.5), toSqrtPrice(0.75), 10000, 5000);
      expect(limit).to.equal(2925);
   })

   it("limit infinite", async() => {
      let limitOne = await curve.testLimitBaseMax(toSqrtPrice(2.25), 10000);
      let limitTwo = await curve.testLimitBaseMin(toSqrtPrice(2.25), 10000);
      let limitThree = await curve.testLimitQuoteMax(toSqrtPrice(2.25), 10000);
      let limitFour = await curve.testLimitQuoteMin(toSqrtPrice(2.25), 10000);

      expect(limitOne).to.equal(1000000); // Effective limit is Inifnity, Hits swap qtyLeft cap
      expect(limitTwo).to.equal(14999); // Rounds down one below reserve
      expect(limitThree).to.equal(6665); // Since virtual reserve is 6666.667, rounds to 6665
      expect(limitFour).to.equal(1000000); 
   })

   it("limit inifinite invert", async() => {
      let limitOne = await curve.testCounterBaseMax(toSqrtPrice(2.25), 10000);
      let limitTwo = await curve.testCounterBaseMin(toSqrtPrice(2.25), 10000);
      let limitThree = await curve.testCounterQuoteMax(toSqrtPrice(2.25), 10000);
      let limitFour = await curve.testCounterQuoteMin(toSqrtPrice(2.25), 10000);
      
       // Hits the swap qtyLeft cap. Represents the counterflow to reach this point, not infinity
      expect(limitOne).to.equal(6568);
      // One reserve token left, counter reserve goes to 10k^2 = 100mn. Subtract 6666 initial...
      expect(limitTwo).to.equal(99993334);
      // One reserve token left, counter reserve goes to 10k^2 = 100mn. Subtract 15000 initial...
      expect(limitThree).to.gte(99985000);
      // Hits the swap qtyLeft cap.
      expect(limitFour).to.equal(14901);
   })


   it("vig flow", async() => {
      let vig = await curve.testVig(10000, 1000, 50000, 0, true, true, 
         toSqrtPrice(0.5), toSqrtPrice(0.25))
      expect(vig[0]).to.equal(116);
      expect(vig[1]).to.equal(0);
   })

   it("vig flow sell", async() => {
      let vig = await curve.testVig(10000, 1000, 50000, 0, false, true, 
         toSqrtPrice(0.1), toSqrtPrice(0.25))
      expect(vig[0]).to.equal(379);
      expect(vig[1]).to.equal(0);

   })

   it("vig flow quote denom", async() => {
      let vig = await curve.testVig(10000, 1000, 50000, 0, false, false, 
         toSqrtPrice(0.5), toSqrtPrice(0.25))
      expect(vig[0]).to.equal(23);
      expect(vig[1]).to.equal(0);
   })

   it("vig flow limit", async() => {
      let vig = await curve.testVig(10000, 5000, 50000, 0, true, false, 
         toSqrtPrice(0.36), toSqrtPrice(0.25))
      expect(vig[0]).to.equal(49);
      expect(vig[1]).to.equal(0);
   })
   
   it("vig protocol cut", async() => {
      let vigOne = await curve.testVig(10000, 1000, 50000, 5, true, true, 
         toSqrtPrice(0.5), toSqrtPrice(0.25))
      let vigTwo = await curve.testVig(10000, 1000, 50000, 5, false, true, 
         toSqrtPrice(0.1), toSqrtPrice(0.25))
      let vigThree = await curve.testVig(10000, 1000, 50000, 5, false, false, 
         toSqrtPrice(0.5), toSqrtPrice(0.25))
      let vigFour = await curve.testVig(10000, 5000, 50000, 5, true, false, 
         toSqrtPrice(0.36), toSqrtPrice(0.25))
         
      expect(vigOne[0]).to.equal(93)
      expect(vigTwo[0]).to.gte(303)
      expect(vigThree[0]).to.equal(19)
      expect(vigFour[0]).to.equal(40)

      expect(vigOne[1]).to.equal(23)
      expect(vigTwo[1]).to.gte(75)
      expect(vigThree[1]).to.equal(4)
      expect(vigFour[1]).to.equal(9)
   }) 

   it("vig infinite max", async() => {
      let vigOne = await curve.testVigMax(10000, 50000, 0, true, toSqrtPrice(2.25))
      let vigTwo = await curve.testVigMax(10000, 50000, 0, false, toSqrtPrice(2.25))
      let vigThree = await curve.testVigMin(10000, 50000, 0, true, toSqrtPrice(2.25))
      let vigFour = await curve.testVigMin(10000, 50000, 6, false, toSqrtPrice(2.25))
     
      // Consumes 6666 out of the 6666.67 (at 5% vig) in virtual reserves
      expect(vigOne[0]).to.equal(333)
      // Counterflow rounds to single token left, and vig is against at the 1:10k reserve
      expect(vigTwo[0]).to.gte(4999250)
      // Counterflow rounds to single token left, and vig is against at the 1:10k reserve
      expect(vigThree[0]).to.equal(4999666)
      // Consumes the full 15k reserve at 5% vig. 1/3 goes to protocol
      expect(vigFour[0]).to.equal(625)

      expect(vigOne[1]).to.equal(0);
      expect(vigTwo[1]).to.equal(0);
      expect(vigThree[1]).to.equal(0);
      expect(vigFour[1]).to.equal(125);
   })

   const COLLATERAL_BUFFER = 4; // Standard buffer used in current code

   it("roll liq", async() => {
      let result = await curve.testRoll(1000, toSqrtPrice(2.25), 10000, true, true);
      expect(result.qtyLeft).to.equal(0);
      expect(result.rollPrice).to.equal(toSqrtPrice(2.56));
      expect(result.paidBase).to.equal(1000);
      expect(result.paidQuote).to.equal(-416 + COLLATERAL_BUFFER);

      result = await curve.testRoll(3000, toSqrtPrice(2.25), 10000, false, true);
      expect(result.qtyLeft).to.equal(0);
      expect(fromSqrtPrice(result.rollPrice)).to.gte(1.4399999);
      expect(fromSqrtPrice(result.rollPrice)).to.lte(1.44);
      expect(result.paidBase).to.equal(-3000);
      expect(result.paidQuote).to.equal(1666 + COLLATERAL_BUFFER);

      result = await curve.testRoll(3333, toSqrtPrice(2.25), 10000, true, false);
      expect(result.qtyLeft).to.equal(0);
      expect(fromSqrtPrice(result.rollPrice)).to.gte(8.99999);
      expect(fromSqrtPrice(result.rollPrice)).to.lte(9.9);
      expect(result.paidBase).to.equal(15000 + COLLATERAL_BUFFER);
      expect(result.paidQuote).to.equal(-3333);

      result = await curve.testRoll(3333, toSqrtPrice(2.25), 10000, false, false);
      expect(result.qtyLeft).to.equal(0);
      expect(fromSqrtPrice(result.rollPrice)).to.equal(1.0);
      expect(result.paidBase).to.equal(-4999 + COLLATERAL_BUFFER);
      expect(result.paidQuote).to.equal(3333);
   })

   it("roll liq infinity", async() => {
      let resultOne = await curve.testRollInf(10000, toSqrtPrice(2.25), true, true);
      let resultTwo = await curve.testRollInf(10000, toSqrtPrice(2.25), false, false);
      const infFloor = BigNumber.from("100000000000000000")

      expect(resultOne.qtyLeft).to.equal(0);
      expect(resultOne.rollPrice).to.equal(maxSqrtPrice());
      expect(resultOne.paidBase).to.gt(infFloor);
      expect(resultOne.paidQuote).to.equal(-6665 + COLLATERAL_BUFFER);

      expect(resultTwo.qtyLeft).to.equal(0);
      expect(resultTwo.rollPrice).to.equal(minSqrtPrice());
      expect(resultTwo.paidBase).to.equal(-14999 + COLLATERAL_BUFFER);
      expect(resultTwo.paidQuote).to.gt(infFloor);
   })


   it("assimilate liq", async() => {
      let result = await curve.testAssimilate(1000, toSqrtPrice(2.25), 
         2000, 7500, toFixedGrowth(0.25), false);      
      expect(fromSqrtPrice(result.shiftPrice)).lte(2.4);
      expect(fromSqrtPrice(result.shiftPrice)).gte(2.3997);      
      expect(fromFixedGrowth(result.shiftGrowth)).to.lte(0.290994);
      expect(fromFixedGrowth(result.shiftGrowth)).to.gte(0.2909);
      expect(fromFixedGrowth(result.concGrowth)).to.lte(0.02523302);
      expect(fromFixedGrowth(result.concGrowth)).to.gte(0.025233);
      expect(result.shiftSeed.toNumber()).to.eq(2000 + 190);

      result = await curve.testAssimilate(1250, toSqrtPrice(0.64), 
         2000, 7500, toFixedGrowth(0.25), true);      
      expect(fromSqrtPrice(result.shiftPrice)).gte(0.64 / 1.1);
      expect(fromSqrtPrice(result.shiftPrice)).lte(0.64 / 1.099);      
      expect(fromFixedGrowth(result.shiftGrowth)).to.lte(0.31088999);
      expect(fromFixedGrowth(result.shiftGrowth)).to.gte(0.31088);
      expect(fromFixedGrowth(result.concGrowth)).to.lte(0.03702629);
      expect(fromFixedGrowth(result.concGrowth)).to.gte(0.037026);
      expect(result.shiftSeed.toNumber()).to.lte(2000 + 279);
      expect(result.shiftSeed.toNumber()).to.lte(2000 + 278);
   })

   it("assimilate zero liq", async() => {
      let result = await curve.testAssimilate(0, toSqrtPrice(2.25), 
         2000, 7500, toFixedGrowth(0.25), false);      
      expect(fromSqrtPrice(result.shiftPrice)).eq(2.25);
      expect(fromFixedGrowth(result.shiftGrowth)).to.eq(0.25);
      expect(fromFixedGrowth(result.concGrowth)).to.lte(0);
      expect(result.shiftSeed.toNumber()).to.eq(2000);
   })
})
