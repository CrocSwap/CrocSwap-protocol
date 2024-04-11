import { TestPool, makeTokenPool, Token, createWbera } from './FacadePool'
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
import { WBERA } from '../typechain';

chai.use(solidity);

describe('Rolling Back Fill', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 0
    let wbera: WBERA

    before(async () => {
        wbera = await createWbera()
    })
    beforeEach("deploy",  async () => {
       test = await makeTokenPool(wbera)
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = false
    })

    it("swap->mint ambient", async() => {
        await test.testMintAmbient(100000)

        let order = await test.prototypeOrder()

        order.hops[0].pools[0].chain.swapDefer = false

        // Ambient liquidity with isAdd=true and qty=0 will use the rolling quantity
        order.hops[0].pools[0].passive.ambient.isAdd = true
        order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(0)
        order.hops[0].pools[0].passive.ambient.rollType = 5
        
        // Base side is the entry in TestFacade, so sell quote to get extra base
        // tokens to mint with
        order.hops[0].pools[0].swap.isBuy = false
        order.hops[0].pools[0].swap.inBaseQty = true
        order.hops[0].pools[0].swap.limitPrice = minSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(10000)

        order.open.dustThresh = BigNumber.from(10)
        
        await test.testOrder(order)

        expect(await test.liquidity()).to.equal(100000*1024 + 8162)
        expect(await test.price()).to.lt(toSqrtPrice(1.5))
        expect(await test.snapBaseOwed()).to.equal(0)
        expect(await test.snapQuoteOwed()).to.equal(13339)
     })


     it("ambient seed deflator", async() => {
        await test.testMintAmbient(100000)
        await test.testRevisePool(100*100, 0, 1)

        // Accumulate a bunch of fees to deflate ambient seeds
        await test.testSwap(true, true, 100000000, maxSqrtPrice())
        await test.testSwap(false, true, 10000000000, toSqrtPrice(1.5))

        let order = await test.prototypeOrder()
        order.hops[0].pools[0].chain.swapDefer = false

        // Ambient liquidity with isAdd=true and qty=0 will use the rolling quantity
        order.hops[0].pools[0].passive.ambient.isAdd = true
        order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(0)
        order.hops[0].pools[0].passive.ambient.rollType = 5
        
        // Base side is the entry in TestFacade, so sell quote to get extra base
        // tokens to mint with
        order.hops[0].pools[0].swap.isBuy = false
        order.hops[0].pools[0].swap.inBaseQty = true
        order.hops[0].pools[0].swap.limitPrice = minSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(10000)

        order.open.dustThresh = BigNumber.from(10)
        
        await test.testOrder(order)

        expect(await test.liquidity()).to.gt(100000*1024 + 8162)
        expect(await test.price()).to.lt(toSqrtPrice(1.5))
        expect(await test.snapBaseOwed()).to.equal(0)
        expect(await test.snapQuoteOwed()).to.equal(13404)        
      })

     it("exit at base", async() => {
      await test.testMintAmbient(100000)

      let order = await test.prototypeOrder()

      order.hops[0].pools[0].chain.swapDefer = false
      order.hops[0].pools[0].chain.rollExit = true

      // Reverse entry/exit
      order.open.token = (await test.quote).address
      order.hops[0].settlement.token = (await test.base).address

      order.hops[0].pools[0].passive.ambient.isAdd = true
      order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(0)
      order.hops[0].pools[0].passive.ambient.rollType = 5

      order.hops[0].pools[0].swap.isBuy = false
      order.hops[0].pools[0].swap.inBaseQty = true
      order.hops[0].pools[0].swap.limitPrice = minSqrtPrice()
      order.hops[0].pools[0].swap.qty = BigNumber.from(10000)

      order.hops[0].settlement.dustThresh = BigNumber.from(10)
      
      await test.testOrder(order)

      expect(await test.liquidity()).to.equal(100000*1024 + 8162)
      expect(await test.price()).to.lt(toSqrtPrice(1.5))
      expect(await test.snapBaseOwed()).to.equal(0)
      expect(await test.snapQuoteOwed()).to.equal(13339)
   })

   it("swap quote->mint ambient", async() => {
      await test.testMintAmbient(100000)

      let order = await test.prototypeOrder()

      order.hops[0].pools[0].chain.swapDefer = false
      order.hops[0].pools[0].chain.rollExit = true

      // Ambient liquidity with isAdd=true and qty=0 will use the rolling quantity
      order.hops[0].pools[0].passive.ambient.isAdd = true
      order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(0)
      order.hops[0].pools[0].passive.ambient.rollType = 5
      
      // Base side is the entry in TestFacade, so sell quote to get extra base
      // tokens to mint with
      order.hops[0].pools[0].swap.isBuy = true
      order.hops[0].pools[0].swap.inBaseQty = true
      order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
      order.hops[0].pools[0].swap.qty = BigNumber.from(10000)

      order.hops[0].settlement.dustThresh = BigNumber.from(10)
      
      await test.testOrder(order)

      expect(await test.liquidity()).to.equal(100000*1024 + 8155)
      expect(await test.price()).to.gt(toSqrtPrice(1.5))
      expect(await test.snapBaseOwed()).to.equal(19992)
      expect(await test.snapQuoteOwed()).to.equal(0)
   })

   // Make sure that entry/exit in roll are set correctly when entry occurs at quote
   // token instead of base.
   it("entry at quote", async() => {
      await test.testMintAmbient(100000)

      let order = await test.prototypeOrder()
      order.hops[0].pools[0].chain.swapDefer = false
      order.hops[0].pools[0].chain.rollExit = false

      // Reverse entry/exit
      order.open.token = (await test.quote).address
      order.hops[0].settlement.token = (await test.base).address

      // Ambient liquidity with isAdd=true and qty=0 will use the rolling quantity
      order.hops[0].pools[0].passive.ambient.isAdd = true
      order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(0)
      order.hops[0].pools[0].passive.ambient.rollType = 5
      
      order.hops[0].pools[0].swap.isBuy = true
      order.hops[0].pools[0].swap.inBaseQty = true
      order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
      order.hops[0].pools[0].swap.qty = BigNumber.from(10000)

      order.open.dustThresh = BigNumber.from(10)
      
      await test.testOrder(order)

      expect(await test.liquidity()).to.equal(100000*1024 + 8155)
      expect(await test.price()).to.gt(toSqrtPrice(1.5))
      expect(await test.snapBaseOwed()).to.equal(19992)
      expect(await test.snapQuoteOwed()).to.equal(0)
   })


     it("swap->burn ambient", async() => {
      await test.testMintAmbient(100000)

      let order = await test.prototypeOrder()

      order.hops[0].pools[0].chain.swapDefer = false

      // Ambient liquidity with isAdd=true and qty=0 will use the rolling quantity
      order.hops[0].pools[0].passive.ambient.isAdd = true
      order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(0)
      order.hops[0].pools[0].passive.ambient.rollType = 5
      
      // Base side is the entry in TestFacade, so sell quote to get extra base
      // tokens to mint with
      order.hops[0].pools[0].swap.isBuy = true
      order.hops[0].pools[0].swap.inBaseQty = true
      order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
      order.hops[0].pools[0].swap.qty = BigNumber.from(10000)

      order.open.dustThresh = BigNumber.from(10)
      
      await test.testOrder(order)

      expect(await test.liquidity()).to.equal(100000*1024 - 8168)
      expect(await test.price()).to.gt(toSqrtPrice(1.5))
      expect(await test.snapBaseOwed()).to.equal(0)
      expect(await test.snapQuoteOwed()).to.equal(-13330)
     })

     it("mint ambient -> swap", async() => {
      await test.testMintAmbient(100000)

      let order = await test.prototypeOrder()

      order.hops[0].pools[0].chain.swapDefer = true

      // Ambient liquidity with isAdd=true and qty=0 will use the rolling quantity
      order.hops[0].pools[0].passive.ambient.isAdd = true
      order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(20000)
      
      // Base side is the entry in TestFacade, so sell quote to get extra base
      // tokens to mint with
      order.hops[0].pools[0].swap.isBuy = false
      order.hops[0].pools[0].swap.inBaseQty = true
      order.hops[0].pools[0].swap.limitPrice = minSqrtPrice()
      order.hops[0].pools[0].swap.qty = BigNumber.from(0)
      order.hops[0].pools[0].swap.rollType = 5

      order.open.dustThresh = BigNumber.from(10)
      
      await test.testOrder(order)

      expect(await test.liquidity()).to.equal(100000*1024 + 20000)
      expect(await test.price()).to.lt(toSqrtPrice(1.5))
      expect(await test.snapBaseOwed()).to.equal(0)
      expect(await test.snapQuoteOwed()).to.equal(32672)
     })

     it("burn ambient -> swap", async() => {
      await test.testMintAmbient(100000)

      let order = await test.prototypeOrder()

      order.hops[0].pools[0].chain.swapDefer = true

      // Ambient liquidity with isAdd=true and qty=0 will use the rolling quantity
      order.hops[0].pools[0].passive.ambient.isAdd = false
      order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(20000)
      
      // Base side is the entry in TestFacade, so sell quote to get extra base
      // tokens to mint with
      order.hops[0].pools[0].swap.isBuy = true
      order.hops[0].pools[0].swap.inBaseQty = true
      order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
      order.hops[0].pools[0].swap.qty = BigNumber.from(0)
      order.hops[0].pools[0].swap.rollType = 5

      order.open.dustThresh = BigNumber.from(10)
      
      await test.testOrder(order)

      expect(await test.liquidity()).to.equal(100000*1024 - 20000)
      expect(await test.price()).to.gt(toSqrtPrice(1.5))
      expect(await test.snapBaseOwed()).to.equal(0)
      expect(await test.snapQuoteOwed()).to.equal(-32651)
     })

     it("swap roll flip direction", async() => {
      await test.testMintAmbient(100000)

      let order = await test.prototypeOrder()

      order.hops[0].pools[0].chain.swapDefer = true

      order.hops[0].pools[0].passive.ambient.isAdd = true
      order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(20000)

      // Roll plug should flip isBuy to the correct direction.
      order.hops[0].pools[0].swap.isBuy = true
      order.hops[0].pools[0].swap.inBaseQty = true
      // Should also disable the limit price, which is one the wrong side of the direction
      order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
      order.hops[0].pools[0].swap.qty = BigNumber.from(0)
      order.hops[0].pools[0].swap.rollType = 5

      order.open.dustThresh = BigNumber.from(10)
      
      await test.testOrder(order)

      expect(await test.liquidity()).to.equal(100000*1024 + 20000)
      expect(await test.price()).to.lt(toSqrtPrice(1.5))
      expect(await test.snapBaseOwed()).to.equal(0)
      expect(await test.snapQuoteOwed()).to.equal(32672)
     })

     it("swap roll flip direction reverse", async() => {
      await test.testMintAmbient(100000)

      let order = await test.prototypeOrder()

      order.hops[0].pools[0].chain.swapDefer = true

      order.hops[0].pools[0].passive.ambient.isAdd = false
      order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(20000)

      // Roll plug should flip isBuy to the correct direction.
      order.hops[0].pools[0].swap.isBuy = false
      order.hops[0].pools[0].swap.inBaseQty = true
      // Should also disable the limit price, which is one the wrong side of the direction
      order.hops[0].pools[0].swap.limitPrice = minSqrtPrice()
      order.hops[0].pools[0].swap.qty = BigNumber.from(0)
      order.hops[0].pools[0].swap.rollType = 5

      order.open.dustThresh = BigNumber.from(10)
      
      await test.testOrder(order)

      expect(await test.liquidity()).to.equal(100000*1024 - 20000)
      expect(await test.price()).to.gt(toSqrtPrice(1.5))
      expect(await test.snapBaseOwed()).to.equal(0)
      expect(await test.snapQuoteOwed()).to.equal(-32651)
     })

     it("swap->mint range", async() => {
        await test.testMintAmbient(100000)

        let order = await test.prototypeOrder()

        order.hops[0].pools[0].chain.swapDefer = false

        // Set to use rolling quantity
        let concen: ConcentratedDirective = {
            lowTick: 4000, highTick: 8000, isRelTick: false, 
            isAdd: true, liquidity: BigNumber.from(0), rollType: 5 }
        order.hops[0].pools[0].passive.concentrated.push(concen)
        
        order.hops[0].pools[0].swap.isBuy = false
        order.hops[0].pools[0].swap.inBaseQty = true
        order.hops[0].pools[0].swap.limitPrice = minSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(10000)
        
        order.open.dustThresh = BigNumber.from(100)
        
        await test.testOrder(order)

        expect(await test.liquidity()).to.equal(100000*1024 + 3067904)
        expect(fromSqrtPrice(await test.price())).to.lt(1.5)
        expect(await test.snapBaseOwed()).to.equal(0)
        expect(await test.snapQuoteOwed()).to.equal(455289)
     })

     it("swap->burn range", async() => {
        await test.testMint(3000, 8000, 100000)

        let order = await test.prototypeOrder()

        order.hops[0].pools[0].chain.swapDefer = false
        // Set to use rolling quantity
        let concen: ConcentratedDirective = {
           lowTick: 3000, highTick: 8000, isAdd: false, isRelTick: false, liquidity: BigNumber.from(0), rollType: 5
         }
      
         order.hops[0].pools[0].passive.concentrated.push(concen)
         order.hops[0].pools[0].swap.isBuy = true
         order.hops[0].pools[0].swap.inBaseQty = true
         order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
         order.hops[0].pools[0].swap.qty = BigNumber.from(15000)
         order.open.dustThresh = BigNumber.from(1000)
         await test.testOrder(order)

         expect(await test.liquidity()).to.equal(100000*1024 - 234*1024)
         expect(fromSqrtPrice(await test.price())).to.gt(1.5)
         expect(await test.snapBaseOwed()).to.equal(0)
         expect(await test.snapQuoteOwed()).to.equal(-44993)
   })

   it("quote -> mint range", async() => {
      await test.testMintAmbient(100000)

      let order = await test.prototypeOrder()

      order.hops[0].pools[0].chain.swapDefer = false
      order.hops[0].pools[0].chain.rollExit = true

      // Set to use rolling quantity
      let concen: ConcentratedDirective = {
          lowTick: 4000, highTick: 8000, isRelTick: false, isAdd: true, liquidity: BigNumber.from(0), rollType: 5
      }
      order.hops[0].pools[0].passive.concentrated.push(concen)
      
      order.hops[0].pools[0].swap.isBuy = true
      order.hops[0].pools[0].swap.inBaseQty = true
      order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
      order.hops[0].pools[0].swap.qty = BigNumber.from(10000)
      order.hops[0].settlement.dustThresh = BigNumber.from(1000)  
      await test.testOrder(order)

      expect(await test.liquidity()).to.equal(100000*1024 + 45056)
      expect(fromSqrtPrice(await test.price())).to.gt(1.5)
      expect(await test.snapBaseOwed()).to.equal(10159)
      expect(await test.snapQuoteOwed()).to.equal(0)
   })

   it("swap->mint below range", async() => {
      await test.testMintAmbient(100000)

      let order = await test.prototypeOrder()

      order.hops[0].pools[0].chain.swapDefer = false

      // Set to use rolling quantity
      let concen: ConcentratedDirective = {
          lowTick: 2000, highTick: 3000, isRelTick: false, isAdd: true, liquidity: BigNumber.from(0), rollType: 5
      }
      order.hops[0].pools[0].passive.concentrated.push(concen)
      
      order.hops[0].pools[0].swap.isBuy = false
      order.hops[0].pools[0].swap.inBaseQty = true
      order.hops[0].pools[0].swap.limitPrice = minSqrtPrice()
      order.hops[0].pools[0].swap.qty = BigNumber.from(10000)
      
      order.open.dustThresh = BigNumber.from(1000)
      
      await test.testOrder(order)

      expect(await test.liquidity()).to.equal(100000*1024)
      expect(fromSqrtPrice(await test.price())).to.lt(1.5)
      expect(await test.snapBaseOwed()).to.equal(0)
      expect(await test.snapQuoteOwed()).to.equal(6671)
   })

   it("quote -> mint below range", async() => {
      await test.testMintAmbient(100000)

      let order = await test.prototypeOrder()

      order.hops[0].pools[0].chain.swapDefer = false
      order.hops[0].pools[0].chain.rollExit = true

      // Set to use rolling quantity
      let concen: ConcentratedDirective = {
          lowTick: 6000, highTick: 8000, isRelTick: false, isAdd: true, liquidity: BigNumber.from(0), rollType: 5}
      order.hops[0].pools[0].passive.concentrated.push(concen)
      
      order.hops[0].pools[0].swap.isBuy = true
      order.hops[0].pools[0].swap.inBaseQty = true
      order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
      order.hops[0].pools[0].swap.qty = BigNumber.from(10000)
      order.hops[0].settlement.dustThresh = BigNumber.from(1000)  
      await test.testOrder(order)

      expect(await test.liquidity()).to.equal(100000*1024)
      expect(fromSqrtPrice(await test.price())).to.gt(1.5)
      expect(await test.snapBaseOwed()).to.equal(10000)
      expect(await test.snapQuoteOwed()).to.equal(0)
   })

   it("swap -> mint wrong side", async() => {
      await test.testMintAmbient(100000)

      let order = await test.prototypeOrder()

      order.hops[0].pools[0].chain.swapDefer = false
      order.hops[0].pools[0].chain.rollExit = true

      // Set to use rolling quantity
      let concen: ConcentratedDirective = {
          lowTick: 2000, highTick: 3000, isRelTick: false, isAdd: true, liquidity: BigNumber.from(0), rollType: 5}
      order.hops[0].pools[0].passive.concentrated.push(concen)
      
      order.hops[0].pools[0].swap.isBuy = true
      order.hops[0].pools[0].swap.inBaseQty = true
      order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
      order.hops[0].pools[0].swap.qty = BigNumber.from(10000)
      order.hops[0].settlement.dustThresh = BigNumber.from(10000)  
      await expect(test.testOrder(order)).to.be.reverted

      order.hops[0].pools[0].chain.rollExit = false
      // Set to use rolling quantity
      concen = {
         lowTick: 6000, highTick: 8000, isRelTick: false, 
         isAdd: true, liquidity: BigNumber.from(0), rollType: 5
      }
      order.hops[0].pools[0].passive.concentrated[0] = concen
     
      order.hops[0].pools[0].swap.isBuy = false
      order.hops[0].pools[0].swap.inBaseQty = true
      order.hops[0].pools[0].swap.limitPrice = minSqrtPrice()
      order.hops[0].pools[0].swap.qty = BigNumber.from(10000)
      await expect(test.testOrder(order)).to.be.reverted
   })

   it("reposition range", async() => {
      await test.testMint(3000, 5000, 100000)

      let order = await test.prototypeOrder()

      order.hops[0].pools[0].chain.swapDefer = false
      order.hops[0].pools[0].chain.rollExit = true

      // Set to use rolling quantity
      let concenBurn: ConcentratedDirective = {
          lowTick: 3000, highTick: 5000, isRelTick: false, isAdd: false, liquidity: BigNumber.from(100000*1024)
      }
      let concenMint: ConcentratedDirective = {
         lowTick: 2000, highTick: 6000, isRelTick: false,
         isAdd: true, liquidity: BigNumber.from(0), rollType: 5}

      order.hops[0].pools[0].passive.concentrated.push(concenBurn)
      order.hops[0].pools[0].passive.concentrated.push(concenMint)      
      order.hops[0].settlement.dustThresh = BigNumber.from(1000) 
      await test.testOrder(order)

      expect(await test.liquidity()).to.equal(49804*1024)
      expect(await test.price()).to.eq(toSqrtPrice(1.5))
      expect(await test.snapBaseOwed()).to.equal(-344467)
      expect(await test.snapQuoteOwed()).to.equal(0)
   })
})
