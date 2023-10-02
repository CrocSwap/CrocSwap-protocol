import { TestPool, makeTokenPool, Token, POOL_IDX } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { simpleSwap } from './EncodeSimple';
import { BigNumber } from 'ethers';
import { ConcentratedDirective } from './EncodeOrder';

chai.use(solidity);

describe('Pool Compound', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 0

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = false
    })

    it("swap->mint", async() => {
        await test.testMintAmbient(100000)

        let order = await test.prototypeOrder()

        order.hops[0].pools[0].chain.swapDefer = false

        order.hops[0].pools[0].passive.ambient.isAdd = true
        order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(100000)
        
        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = true
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(1000000)
        
        await test.testOrder(order)

        expect(await test.liquidity()).to.equal(100000*1024 + 100000)
        expect(fromSqrtPrice(await test.price())).to.gt(1.52401)
        expect(fromSqrtPrice(await test.price())).to.lt(1.52402)
        expect(await test.snapBaseOwed()).to.equal(1123455)
        expect(await test.snapQuoteOwed()).to.equal(-580375)
     })

     it("swap defer", async() => {
        await test.testMintAmbient(100000)

        let order = await test.prototypeOrder()

        order.hops[0].pools[0].chain.swapDefer = true

        order.hops[0].pools[0].passive.ambient.isAdd = true
        order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(100000)
        
        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = true
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(1000000)
        
        await test.testOrder(order)

        // Should be the same as non-deferred swap (see above test)
        expect(await test.liquidity()).to.equal(100000*1024 + 100000)
        expect(fromSqrtPrice(await test.price())).to.gt(1.52399)
        expect(fromSqrtPrice(await test.price())).to.lt(1.52401)

        // Should be slightly different. More quote owed, because we're minting at a slightly
        // cheaper pre-swap price.
        expect(await test.snapBaseOwed()).to.equal(1122478)
        expect(await test.snapQuoteOwed()).to.equal(-579733)
     })

     it("swap->burn ", async() => {
        await test.testMintAmbient(100000)

        let order = await test.prototypeOrder()

        order.hops[0].pools[0].chain.swapDefer = false

        order.hops[0].pools[0].passive.ambient.isAdd = false
        order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(50000)
        
        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = true
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(1000000)
        
        await test.testOrder(order)

        expect(await test.liquidity()).to.equal(100000*1024 - 50000)
        expect(fromSqrtPrice(await test.price())).to.gt(1.52401)
        expect(fromSqrtPrice(await test.price())).to.lt(1.52402)
        expect(await test.snapBaseOwed()).to.equal(938275)
        expect(await test.snapQuoteOwed()).to.equal(-701883)
     })

     it("mint concentrated", async() => {
        await test.testMintAmbient(100000)

        let order = await test.prototypeOrder()

        order.hops[0].pools[0].chain.swapDefer = false

        let concen: ConcentratedDirective = {
            lowTick: 4000, isRelTick: false,
            highTick: 8000, isAdd: true, rollType: 0, liquidity: BigNumber.from(1024*100)
        }
        order.hops[0].pools[0].passive.concentrated.push(concen)
        
        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = true
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(1000000)
        
        await test.testOrder(order)

        expect(await test.liquidity()).to.equal(100000*1024 + 100*1024)
        expect(fromSqrtPrice(await test.price())).to.gt(1.52401)
        expect(fromSqrtPrice(await test.price())).to.lt(1.52402)
     })

   //   it("multiple range orders", async() => {
   //      await test.testMint(-5000, 10000, 1000)
   //      await test.testMint(-5000, 8000, 1000)
   //      await test.testMint(3000, 8000, 1000)

   //      let order = await test.prototypeOrder()

   //      order.hops[0].pools[0].chain.swapDefer = false

   //      let concens: ConcentratedDirective[] = [{
   //          lowTick: -5000, isRelTick: false,
   //          highTick: 8000, isAdd: false, rollType: 0, liquidity: BigNumber.from(200*1024)},
   //          {
   //             lowTick: 8000, isRelTick: false, highTick: 10000, isAdd: true, rollType: 0, liquidity: BigNumber.from(2000*1024)            
   //          },
   //      {
   //          lowTick: -5000, isRelTick: false,
   //          highTick: 10000, isAdd: false, rollType: 0, liquidity: BigNumber.from(500*1024)},
   //       {
   //          lowTick: -5000, isRelTick: false,
   //          highTick: 0, isAdd: true, rollType: 0, liquidity: BigNumber.from(400*1024)

   //      }]

   //      order.hops[0].pools[0].passive.concentrated = concens
   //      order.hops[0].pools[0].swap.isBuy = true
   //      order.hops[0].pools[0].swap.inBaseQty = true
   //      order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
   //      order.hops[0].pools[0].swap.qty = BigNumber.from(10000)
        
   //      await test.testOrder(order)

   //      expect(await test.liquidity()).to.equal(2300*1024)
   //   })
})

describe('Pool Compound Curve Cache', () => {
      let test: TestPool
      const feeRate = 250 * 100
  
   beforeEach("deploy",  async () => {
      test = await makeTokenPool()
  
      await test.initPool(feeRate, 0, 1, 1.5)
      test.useHotPath = true
   })
  
   // Tests for relatively bespoke corner case. In the long-form path, we need to make sure that
   // a swap updates the CurveCache tick in the ColdInjector before calling any operations.
   it("swap curve cache", async() => {
      await test.testMintAmbient(100000)
      await test.testMint(-25000, 25000, 100000)

      // Pre-populate global fee odometer
      await test.testSwap(true, true, 100000*1024, toSqrtPrice(2.0))
      await test.testSwap(false, true, 100000*1024, toSqrtPrice(1.5))

      let order = await test.prototypeOrder()

      order.hops[0].pools[0].chain.swapDefer = false

      let concen: ConcentratedDirective = {
         lowTick: 4100, isRelTick: false,
         highTick: 4200, isAdd: true, rollType: 0, liquidity: BigNumber.from(1024*100000)
      }
      order.hops[0].pools[0].passive.concentrated.push(concen)
     
      order.hops[0].pools[0].swap.isBuy = true
      order.hops[0].pools[0].swap.inBaseQty = true
      order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
      order.hops[0].pools[0].swap.qty = BigNumber.from(1000000)
      
      await test.testOrder(order)

      // Makes sure that the range order odometer was pivoted below the post-swap tick (4133)
      let bidOdometer = (await (await test.query).queryLevel((await test.base).address,
         (await test.quote).address, POOL_IDX, 4100)).odometer
      let askOdometer = (await (await test.query).queryLevel((await test.base).address,
         (await test.quote).address, POOL_IDX, 4200)).odometer
      expect(bidOdometer).to.not.eq(askOdometer)

      // Earned fees should be correctly calculated if bid/ask pivot was correctly set at level
      // initialization time.
      await test.testSwap(false, true, 1000000, toSqrtPrice(1.5))
      await test.testSwap(true, true, 1000000, toSqrtPrice(2.0))
      await test.testHarvest(4100, 4200)
      expect(await test.snapBaseOwed()).to.equal(-5142)
      expect(await test.snapQuoteOwed()).to.equal(-3402)
   })

})
