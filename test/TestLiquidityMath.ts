import { TestLiquidityMath } from '../typechain/TestLiquidityMath';
import { expect } from "chai";
import chai from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import { toFixedGrowth } from './FixedPoint';
import { BigNumber } from 'ethers';

chai.use(solidity);

describe('LiquidityMath', () => {
   let liq: TestLiquidityMath

   beforeEach("deploy", async () => {
      const libFactory = await ethers.getContractFactory("TestLiquidityMath");
      liq = (await libFactory.deploy()) as TestLiquidityMath;
   })

   it("add", async () => {
      let result = await liq.testAddUnsigned(100, 150);
      expect(result.toNumber()).to.equal(250);
   })

   it("add signed", async () => {
      let resultOne = await liq.testAddSigned(100, 150);
      let resultTwo = await liq.testAddSigned(150, -75);
      let resultThree = await liq.testAddSigned(150, -150);
      
      expect(resultOne.toNumber()).to.equal(250);
      expect(resultTwo.toNumber()).to.equal(75);
      expect(resultThree.toNumber()).to.equal(0);      
      expect(liq.testAddSigned(200, -201)).to.be.reverted;
   }) 

   it("minus", async () => {
      let result = await liq.testMinus(100, 75);
      expect(result.toNumber()).to.equal(25);
      expect(liq.testMinus(100, 101)).to.be.reverted;
   })

   const DELTA_OFFSET = 2

   it("delta rewards", async() => {
      let result = await liq.testDeltaRewards(5000, 4000)
      expect(await result.toNumber()).to.eq(1000 - DELTA_OFFSET)

      let bigMileage = BigNumber.from(2).pow(64).sub(50000)
      result = await liq.testDeltaRewards(bigMileage, 50000)
      expect(await result).to.eq(bigMileage.sub(50000 + DELTA_OFFSET))

      result = await liq.testDeltaRewards(bigMileage, bigMileage.sub(50000))
      expect(await result).to.eq(50000 - DELTA_OFFSET)
   })

   it("delta rewards oversize", async() => {
      // Negative deltas cast to zero and don't overflow
      let bigMileage = BigNumber.from(2).pow(64).sub(50000)
      let result = await liq.testDeltaRewards(50000, bigMileage)
      expect(await result).to.eq(0)

      // Below the round down offset casts to 0
      result = await liq.testDeltaRewards(10000, 10000)
      expect(await result).to.eq(0)

      result = await liq.testDeltaRewards(10001, 10000)
      expect(await result).to.eq(0)

      result = await liq.testDeltaRewards(10002, 10000)
      expect(await result).to.eq(0)

      result = await liq.testDeltaRewards(10003, 10000)
      expect(await result).to.eq(1)
   })

   it("delta rewards 72-bit", async() => {
      let result = await liq.testDeltaRewards72(5000, 4000)
      expect(await result.toNumber()).to.eq(1000 - DELTA_OFFSET)

      let bigMileage = BigNumber.from(2).pow(64).add(50000)
      result = await liq.testDeltaRewards72(bigMileage, 50000)
      expect(await result).to.eq(bigMileage.sub(50000 + DELTA_OFFSET))

      result = await liq.testDeltaRewards72(bigMileage, bigMileage.sub(50000))
      expect(await result).to.eq(50000 - DELTA_OFFSET)
   })

   it("delta rewards 72-bit oversize", async() => {
      // Negative deltas cast to zero and don't overflow
      let bigMileage = BigNumber.from(2).pow(64).add(50000)
      let result = await liq.testDeltaRewards72(50000, bigMileage)
      expect(await result).to.eq(0)

      // Below the round down offset casts to 0
      result = await liq.testDeltaRewards72(10000, 10000)
      expect(await result).to.eq(0)

      result = await liq.testDeltaRewards72(10001, 10000)
      expect(await result).to.eq(0)

      result = await liq.testDeltaRewards72(10002, 10000)
      expect(await result).to.eq(0)

      result = await liq.testDeltaRewards72(10003, 10000)
      expect(await result).to.eq(1)

      // Gap over uint64 max
      let maxMileage64Bit = BigNumber.from(2).pow(64).sub(1)
      result = await liq.testDeltaRewards72(bigMileage, 0)
      expect(await result).to.eq(maxMileage64Bit)
   })

   it("blend mileage", async() => {
      let blended = await liq.testBlendMileage(1000, 75, 2000, 25)
      expect(blended).to.eq(1250 + DELTA_OFFSET)

      // No blending needed because 0 weight on one side
      blended = await liq.testBlendMileage(1000, 0, 2000, 25)
      expect(blended).to.eq(2000)
      blended = await liq.testBlendMileage(1000, 150, 2000, 0)
      expect(blended).to.eq(1000)

      // No blending (and round up) because equal mileage
      blended = await liq.testBlendMileage(2000, 150, 2000, 200)
      expect(blended).to.eq(2000)

      // Make sure very mileage blends correctly
      let bigOffset = BigNumber.from(2).pow(64).sub(3000)
      blended = await liq.testBlendMileage(bigOffset.add(1000), 75, bigOffset.add(2000), 25)
      expect(blended).to.eq(bigOffset.add(1250 + DELTA_OFFSET))

      // Make sure we can handle weights at end of uint128
      let hugeWeight = BigNumber.from(2).pow(127)
      blended = await liq.testBlendMileage(1000, hugeWeight, 2000, hugeWeight.div(2))
      expect(blended).to.eq(1332 + DELTA_OFFSET)

      blended = await liq.testBlendMileage(bigOffset.add(1000), hugeWeight, bigOffset.add(2000), hugeWeight.div(2))
      expect(blended).to.eq(bigOffset.add(1333 + DELTA_OFFSET))
   })

   it("blend mileage 72 bit", async() => {
      let blended = await liq.testBlendMileage72(1000, 75, 2000, 25)
      expect(blended).to.eq(1250 + DELTA_OFFSET)

      // No blending needed because 0 weight on one side
      blended = await liq.testBlendMileage72(1000, 0, 2000, 25)
      expect(blended).to.eq(2000)
      blended = await liq.testBlendMileage72(1000, 150, 2000, 0)
      expect(blended).to.eq(1000)

      // No blending (and round up) because equal mileage
      blended = await liq.testBlendMileage72(2000, 150, 2000, 200)
      expect(blended).to.eq(2000)

      // Make sure very mileage blends correctly
      let bigOffset = BigNumber.from(2).pow(70).sub(3000)
      blended = await liq.testBlendMileage72(bigOffset.add(1000), 75, bigOffset.add(2000), 25)
      expect(blended).to.eq(bigOffset.add(1250 + DELTA_OFFSET))

      // Make sure we can handle weights at end of uint128
      let hugeWeight = BigNumber.from(2).pow(127)
      blended = await liq.testBlendMileage72(1000, hugeWeight, 2000, hugeWeight.div(2))
      expect(blended).to.eq(1332 + DELTA_OFFSET)

      blended = await liq.testBlendMileage72(bigOffset.add(1000), hugeWeight, bigOffset.add(2000), hugeWeight.div(2))
      expect(blended).to.eq(bigOffset.add(1333 + DELTA_OFFSET))
   })
})
