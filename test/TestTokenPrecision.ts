import { TestCurveMath } from '../typechain/TestCurveMath';
import { expect } from "chai";
import chai from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import { BigNumber } from 'ethers';
import { toFixedGrowth, toSqrtPrice, fromSqrtPrice, fromFixedGrowth, maxSqrtPrice, minSqrtPrice } from './FixedPoint';

chai.use(solidity);

describe('Token Precision', () => {
   let curve: TestCurveMath

   beforeEach("deploy", async () => {
      const libFactory = await ethers.getContractFactory("TestCurveMath");
      curve = (await libFactory.deploy()) as TestCurveMath;
   })

   // Price is represented as Q64.64. Therefore it has 64 bits of precision
   const PRICE_FIXED_POINT_BITS = 64;

   // Calculates the total number of AMM base token reserves needed given a fixed liquidity
   // and price value
   function deriveBaseReserves (liq: BigNumber, price: BigNumber): BigNumber {
      // Formula is based on 
      //     L = sqrt(B*Q)
      //     P = sqrt(B/Q)
      //
      //   therefore 
      //     B = L*P
      return liq.mul(price).shr(PRICE_FIXED_POINT_BITS)
   }

   // Calculates the total number of AMM base token reserves needed given a fixed liquidity
   // and price value
   function deriveQuoteReserves (liq: BigNumber, price: BigNumber): BigNumber {
      // Formula is based on 
      //     L = sqrt(B*Q)
      //     P = sqrt(B/Q)
      //
      //   therefore 
      //     Q = L/P
      return liq.shl(PRICE_FIXED_POINT_BITS).div(price)
   }

   // Shifts the Q64.64 price representation by a single fixed point unit
   function shiftPriceUp (price: BigNumber): BigNumber {
      return price.add(1)
   }

   function shiftPriceDown (price: BigNumber): BigNumber {
      return price.sub(1)
   }

   // Calculated the incremental of base tokens required to keep the curve collaterlized
   // for a 1-unit shift in price
   function neededBaseReserves (liq: BigNumber, price: BigNumber) {
      let startReserves = deriveBaseReserves(liq, price)
      let nextReserves = deriveBaseReserves(liq, shiftPriceUp(price))
      return nextReserves.sub(startReserves)
   }

   // Calculated the incremental of base tokens required to keep the curve collaterlized
   // for a 1-unit shift in price
   function neededQuoteReserves (liq: BigNumber, price: BigNumber) {
      let startReserves = deriveQuoteReserves(liq, price)
      let nextReserves = deriveQuoteReserves(liq, shiftPriceDown(price))
      return nextReserves.sub(startReserves)
   }

   async function testBaseTokens (liq: BigNumber, priceRatio: number) {
      let price = toSqrtPrice(priceRatio)
      // First calculate how much the token precision tells us
      let result = curve.testTokenPrecision(liq, price, true)

      // Then make sure the value calculated in Solidity is more than the change if we
      // directly back out the AMM-implied reserves from the newly shifted price
      expect(await result).gt(neededBaseReserves(liq, price))
   }

   async function testQuoteTokens (liq: BigNumber, priceRatio: number) {
      let price = toSqrtPrice(priceRatio)
      // First calculate how much the token precision tells us
      let result = curve.testTokenPrecision(liq, price, false)

      // Then make sure the value calculated in Solidity is more than the change if we
      // directly back out the AMM-implied reserves from the newly shifted price
      expect(await result).gt(neededQuoteReserves(liq, price))
   }

   it("base token medium low liquidity", async() => {
      let liq = BigNumber.from(2).pow(30)
      await testBaseTokens(liq, 0.000000000001)
      await testBaseTokens(liq, 0.0000001)
      await testBaseTokens(liq, 0.0001)
      await testBaseTokens(liq, 1.0)
      await testBaseTokens(liq, 5000.5)
      await testBaseTokens(liq, 89430583.4)
      await testBaseTokens(liq, 1000000000000000)
   })

   it("base token low liquidity", async() => {
      let liq = BigNumber.from(2).pow(10)
      await testBaseTokens(liq, 0.000000000001)
      await testBaseTokens(liq, 0.0000001)
      await testBaseTokens(liq, 0.0001)
      await testBaseTokens(liq, 1.0)
      await testBaseTokens(liq, 5000.5)
      await testBaseTokens(liq, 89430583.4)
      await testBaseTokens(liq, 1000000000000000)
   })

   it("base token very low liquidity", async() => {
      let liq = BigNumber.from(2).pow(1)
      await testBaseTokens(liq, 0.000000000001)
      await testBaseTokens(liq, 0.0000001)
      await testBaseTokens(liq, 0.0001)
      await testBaseTokens(liq, 1.0)
      await testBaseTokens(liq, 5000.5)
      await testBaseTokens(liq, 89430583.4)
      await testBaseTokens(liq, 1000000000000000)
   })

   it("base token medium liquidity", async() => {
      let liq = BigNumber.from(2).pow(60)
      await testBaseTokens(liq, 0.000000000001)
      await testBaseTokens(liq, 0.0000001)
      await testBaseTokens(liq, 0.0001)
      await testBaseTokens(liq, 1.0)
      await testBaseTokens(liq, 5000.5)
      await testBaseTokens(liq, 89430583.4)
      await testBaseTokens(liq, 1000000000000000)
   })

   it("base token medium high liquidity", async() => {
      let liq = BigNumber.from(2).pow(70)
      await testBaseTokens(liq, 0.000000000001)
      await testBaseTokens(liq, 0.0000001)
      await testBaseTokens(liq, 0.0001)
      await testBaseTokens(liq, 1.0)
      await testBaseTokens(liq, 5000.5)
      await testBaseTokens(liq, 89430583.4)
      await testBaseTokens(liq, 1000000000000000)
   })

   it("base token high liquidity", async() => {
      let liq = BigNumber.from(2).pow(100)
      await testBaseTokens(liq, 0.000000000001)
      await testBaseTokens(liq, 0.0000001)
      await testBaseTokens(liq, 0.0001)
      await testBaseTokens(liq, 1.0)
      await testBaseTokens(liq, 5000.5)
      await testBaseTokens(liq, 89430583.4)
      await testBaseTokens(liq, 1000000000000000)
   })

   it("base token very high liquidity", async() => {
      let liq = BigNumber.from(2).pow(127)
      await testBaseTokens(liq, 0.000000000001)
      await testBaseTokens(liq, 0.0000001)
      await testBaseTokens(liq, 0.0001)
      await testBaseTokens(liq, 1.0)
      await testBaseTokens(liq, 5000.5)
      await testBaseTokens(liq, 89430583.4)
      await testBaseTokens(liq, 1000000000000000)
   })

   it("quote token medium low liquidity", async() => {
      let liq = BigNumber.from(2).pow(30)
      await testQuoteTokens(liq, 0.000000000001)
      await testQuoteTokens(liq, 0.0000001)
      await testQuoteTokens(liq, 0.0001)
      await testQuoteTokens(liq, 1.0)
      await testQuoteTokens(liq, 5000.5)
      await testQuoteTokens(liq, 89430583.4)
      await testQuoteTokens(liq, 1000000000000000)
   })

   it("quote token low liquidity", async() => {
      let liq = BigNumber.from(2).pow(10)
      await testQuoteTokens(liq, 0.000000000001)
      await testQuoteTokens(liq, 0.0000001)
      await testQuoteTokens(liq, 0.0001)
      await testQuoteTokens(liq, 1.0)
      await testQuoteTokens(liq, 5000.5)
      await testQuoteTokens(liq, 89430583.4)
      await testQuoteTokens(liq, 1000000000000000)
   })

   it("quote token very low liquidity", async() => {
      let liq = BigNumber.from(2).pow(1)
      await testQuoteTokens(liq, 0.000000000001)
      await testQuoteTokens(liq, 0.0000001)
      await testQuoteTokens(liq, 0.0001)
      await testQuoteTokens(liq, 1.0)
      await testQuoteTokens(liq, 5000.5)
      await testQuoteTokens(liq, 89430583.4)
      await testQuoteTokens(liq, 1000000000000000)
   })

   it("quote token medium liquidity", async() => {
      let liq = BigNumber.from(2).pow(60)
      await testQuoteTokens(liq, 0.000000000001)
      await testQuoteTokens(liq, 0.0000001)
      await testQuoteTokens(liq, 0.0001)
      await testQuoteTokens(liq, 1.0)
      await testQuoteTokens(liq, 5000.5)
      await testQuoteTokens(liq, 89430583.4)
      await testQuoteTokens(liq, 1000000000000000)
   })

   it("quote token medium high liquidity", async() => {
      let liq = BigNumber.from(2).pow(70)
      await testQuoteTokens(liq, 0.000000000001)
      await testQuoteTokens(liq, 0.0000001)
      await testQuoteTokens(liq, 0.0001)
      await testQuoteTokens(liq, 1.0)
      await testQuoteTokens(liq, 5000.5)
      await testQuoteTokens(liq, 89430583.4)
      await testQuoteTokens(liq, 1000000000000000)
   })

   it("quote token high liquidity", async() => {
      let liq = BigNumber.from(2).pow(100)
      await testQuoteTokens(liq, 0.000000000001)
      await testQuoteTokens(liq, 0.0000001)
      await testQuoteTokens(liq, 0.0001)
      await testQuoteTokens(liq, 1.0)
      await testQuoteTokens(liq, 5000.5)
      await testQuoteTokens(liq, 89430583.4)
      await testQuoteTokens(liq, 1000000000000000)
   })

   it("quote token very high liquidity", async() => {
      let liq = BigNumber.from(2).pow(127)
      await testQuoteTokens(liq, 0.000000000001)
      await testQuoteTokens(liq, 0.0000001)
      await testQuoteTokens(liq, 0.0001)
      await testQuoteTokens(liq, 1.0)
      await testQuoteTokens(liq, 5000.5)
      await testQuoteTokens(liq, 89430583.4)
      await testQuoteTokens(liq, 1000000000000000)
   })
})
