import { TestPool, makeTokenPool, Token } from './FacadePool'
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

describe('Roll Surplus', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    let sender: string
    const feeRate = 0

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote
       sender = await (await test.trader).getAddress() 

       await test.initPool(feeRate, 0, 1, 1.5)
       await (await test.dex).collectSurplus(sender, -100000, baseToken.address, false) 
       await (await test.dex).collectSurplus(sender, -250000, quoteToken.address, false) 
    })

    it("roll surplus", async() => {
        await test.testMintAmbient(1000)

        let order = await test.prototypeOrder()

        order.hops[0].pools[0].chain.swapDefer = false

        // Ambient liquidity with isAdd=true and qty=0 will use the rolling quantity
        order.hops[0].pools[0].chain.offsetSurplus = true
        order.hops[0].pools[0].passive.ambient.isAdd = true
        order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(0)
        
        order.open.useSurplus = true
        order.open.dustThresh = BigNumber.from(10)
        
        await test.testOrder(order)

        expect(await test.liquidity()).to.equal(1000*1024 + 81646)
        expect(await test.snapBaseOwed()).to.equal(0)
        expect(await test.snapQuoteOwed()).to.equal(66667)
        expect(await (await test.query).querySurplus(sender, baseToken.address)).to.equal(1)
        expect(await (await test.query).querySurplus(sender, quoteToken.address)).to.equal(250000)
     })

     it("roll stacked", async() => {
      await test.testMintAmbient(100000)

        let order = await test.prototypeOrder()

        order.hops[0].pools[0].chain.swapDefer = false

        // Ambient liquidity with isAdd=true and qty=0 will use the rolling quantity
        order.hops[0].pools[0].chain.offsetSurplus = true
        order.hops[0].pools[0].passive.ambient.isAdd = true
        order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(0)
        
        // Base side is the entry in TestFacade, so sell quote to get extra base
        // tokens to mint with
        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = true
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(10000)

        order.open.useSurplus = true
        order.open.dustThresh = BigNumber.from(10)
        
        await test.testOrder(order)

        expect(await test.liquidity()).to.equal(100000*1024 + 73475)
        expect(await test.snapBaseOwed()).to.equal(0)
        expect(await test.snapQuoteOwed()).to.equal(53329)
        expect(await (await test.query).querySurplus(sender, baseToken.address)).to.equal(1)
        expect(await (await test.query).querySurplus(sender, quoteToken.address)).to.equal(250000)
   })

   it("surplus exit", async() => {
      await test.testMintAmbient(1000)

      let order = await test.prototypeOrder()

      order.hops[0].pools[0].chain.swapDefer = false
      order.hops[0].pools[0].chain.rollExit = true

      // Ambient liquidity with isAdd=true and qty=0 will use the rolling quantity
      order.hops[0].pools[0].chain.offsetSurplus = true
      order.hops[0].pools[0].passive.ambient.isAdd = true
      order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(0)
      
      order.hops[0].settlement.useSurplus = true
      order.open.dustThresh = BigNumber.from(10)
      
      await test.testOrder(order)

      expect(await test.liquidity()).to.equal(1000*1024 + 306181)
      expect(await test.snapBaseOwed()).to.equal(374997)
      expect(await test.snapQuoteOwed()).to.equal(0)
      expect(await (await test.query).querySurplus(sender, baseToken.address)).to.equal(100000)
      expect(await (await test.query).querySurplus(sender, quoteToken.address)).to.equal(1)
   })

   it("surplus entry+exit", async() => {
      await test.testMintAmbient(1000)

      let order = await test.prototypeOrder()

      let owner = await (await test.trader).getAddress();
      // Top up the balance to 500,000
      await (await test.dex).collectSurplus(owner, -400000, test.base.address, false);

      order.open.useSurplus = true
      order.hops[0].pools[0].chain.swapDefer = false
      order.hops[0].pools[0].chain.rollExit = true

      // Ambient liquidity with isAdd=true and qty=0 will use the rolling quantity
      order.hops[0].pools[0].chain.offsetSurplus = true
      order.hops[0].pools[0].passive.ambient.isAdd = true
      order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(0)
      
      order.hops[0].settlement.useSurplus = true
      order.open.dustThresh = BigNumber.from(10)
      
      await test.testOrder(order)

      expect(await test.liquidity()).to.equal(1000*1024 + 306181)
      expect(await test.snapBaseOwed()).to.equal(0)
      expect(await test.snapQuoteOwed()).to.equal(0)
      expect(await (await test.query).querySurplus(sender, baseToken.address)).to.equal(125003)
      expect(await (await test.query).querySurplus(sender, quoteToken.address)).to.equal(1)
   })
})
