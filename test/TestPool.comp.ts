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
            openTick: 4000,
            bookends: [{closeTick: 8000, isAdd: true, liquidity: BigNumber.from(1024*100)}]
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

     it("multiple range orders", async() => {
        await test.testMint(-5000, 10000, 1000)
        await test.testMint(-5000, 8000, 1000)
        await test.testMint(3000, 8000, 1000)

        let order = await test.prototypeOrder()

        order.hops[0].pools[0].chain.swapDefer = false

        let concens: ConcentratedDirective[] = [{
            openTick: 8000,
            bookends: [{closeTick: -5000, isAdd: false, liquidity: BigNumber.from(200*1024)},
                {closeTick: 10000, isAdd: true, liquidity: BigNumber.from(2000*1024) }]
            },
        {
            openTick: -5000,
            bookends: [{closeTick: 10000, isAdd: false, liquidity: BigNumber.from(500*1024)},
                {closeTick: 0, isAdd: true, liquidity: BigNumber.from(400*1024)}]

        }]

        order.hops[0].pools[0].passive.concentrated = concens
        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = true
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(10000)
        
        await test.testOrder(order)

        expect(await test.liquidity()).to.equal(2300*1024)
     })

})
