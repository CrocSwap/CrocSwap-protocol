import { TestPool, makeTokenPool, Token, makeTokenNext, makeTokenSeq, makeTokenTriangle } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber } from 'ethers';
import { ConcentratedDirective } from './EncodeOrder';

chai.use(solidity);

describe('Roll between pairs', () => {
    let test: TestPool
    let test2: TestPool
    let test3: TestPool
    const feeRate = 0
    
    beforeEach("deploy",  async () => {
        let tests = await makeTokenSeq()
        test = tests[0]
        test2 = tests[1]
        test3 = tests[2]

       await test.initPool(feeRate, 0, 1, 1.5)
       await test2.initPool(feeRate, 0, 1, 0.5)
       await test3.initPool(feeRate, 0, 1, 4.0)
    })

    it("two pairs", async() => {
        await test.testMintAmbient(10000)
        await test2.testMintAmbient(20000)
        await test3.testMintAmbient(30000)
        
        let order = await test.prototypeOrder()
        let order2 = await test2.prototypeOrder()
        let order3 = await test3.prototypeOrder()
        
        order.hops.push(order2.hops[0])
        //order.hops.push(order3.hops[0])

        order.hops[1].settlement = order2.hops[0].settlement

        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = false
        order.hops[0].pools[0].swap.qty = BigNumber.from(10000)
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        
        order.hops[1].pools[0].swap.isBuy = true
        order.hops[1].pools[0].swap.inBaseQty = true
        order.hops[1].pools[0].swap.qty = BigNumber.from(0)
        order.hops[1].pools[0].swap.limitPrice = maxSqrtPrice()
        
        await test2.snapStart()
        let tx = await test.testOrder(order)

        expect(await test.price()).to.be.gt(toSqrtPrice(1.5))
        expect(await test2.price()).to.be.gt(toSqrtPrice(0.5))

        expect(await test.snapBaseOwed()).to.equal(15021)        
        expect(await test.snapQuoteOwed()).to.equal(0)
        expect(await test2.snapBaseOwed()).to.equal(0)        
        expect(await test2.snapQuoteOwed()).to.equal(-19982)

        order.hops[0].pools[0].swap.qty = BigNumber.from(100)
        tx = await test.testOrder(order)
        console.log((await tx.wait()).gasUsed.toString())
    })

    it("mint -> swap", async() => {
        await test.testMintAmbient(10000)
        await test2.testMintAmbient(20000)
        await test3.testMintAmbient(30000)
        
        let order = await test.prototypeOrder()
        let order2 = await test2.prototypeOrder()
        let order3 = await test3.prototypeOrder()
        
        order.hops.push(order2.hops[0])
        //order.hops.push(order3.hops[0])

        order.hops[1].settlement = order2.hops[0].settlement

        order.hops[0].pools[0].passive.ambient.isAdd = true
        order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(10000)
        
        order.hops[1].pools[0].swap.isBuy = false
        order.hops[1].pools[0].swap.inBaseQty = true
        order.hops[1].pools[0].swap.qty = BigNumber.from(0)
        order.hops[1].pools[0].swap.limitPrice = minSqrtPrice()
        
        await test2.snapStart()
        await test.testOrder(order)

        expect(await test.price()).to.be.eq(toSqrtPrice(1.5))
        expect(await test2.price()).to.be.lt(toSqrtPrice(0.5))

        expect(await test.snapBaseOwed()).to.equal(12251)
        expect(await test.snapQuoteOwed()).to.equal(0)
        expect(await test2.snapBaseOwed()).to.equal(0)        
        expect(await test2.snapQuoteOwed()).to.equal(16349)
    })

    it("quote entry", async() => {
        await test.testMintAmbient(10000)
        await test2.testMintAmbient(20000)
        await test3.testMintAmbient(30000)
        
        let order = await test.prototypeOrder()
        let order2 = await test2.prototypeOrder()
        let order3 = await test3.prototypeOrder()
        
        order.hops.push(order2.hops[0])
        //order.hops.push(order3.hops[0])

        order.open.token = (await test2.quote).address
        order.hops[0].settlement.token = (await test.quote).address
        order.hops[1].settlement.token = (await test.base).address

        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = true
        order.hops[0].pools[0].swap.qty = BigNumber.from(10000)
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        
        order.hops[1].pools[0].swap.isBuy = true
        order.hops[1].pools[0].swap.inBaseQty = false
        order.hops[1].pools[0].swap.qty = BigNumber.from(0)
        order.hops[1].pools[0].swap.limitPrice = maxSqrtPrice()

        await test2.snapStart()
        await test.testOrder(order)

        expect(await test.price()).to.be.gt(toSqrtPrice(1.5))
        expect(await test2.price()).to.be.gt(toSqrtPrice(0.5))

        expect(await test.snapBaseOwed()).to.equal(15021)        
        expect(await test.snapQuoteOwed()).to.equal(0)
        expect(await test2.snapBaseOwed()).to.equal(0)        
        expect(await test2.snapQuoteOwed()).to.equal(-19982)
    })

    it("three pair sequence", async() => {
        await test.testMintAmbient(10000)
        await test2.testMintAmbient(20000)
        await test3.testMintAmbient(30000)
        
        let order = await test.prototypeOrder()
        let order2 = await test2.prototypeOrder()
        let order3 = await test3.prototypeOrder()
        
        order.hops.push(order2.hops[0])
        order.hops.push(order3.hops[0])

        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = false
        order.hops[0].pools[0].swap.qty = BigNumber.from(10000)
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        
        order.hops[1].settlement = order2.hops[0].settlement
        order.hops[1].pools[0].swap.isBuy = true
        order.hops[1].pools[0].swap.inBaseQty = true
        order.hops[1].pools[0].swap.qty = BigNumber.from(0)
        order.hops[1].pools[0].swap.limitPrice = maxSqrtPrice()

        order.hops[2].settlement = order3.hops[0].settlement
        order.hops[2].pools[0].swap.isBuy = true
        order.hops[2].pools[0].swap.inBaseQty = true
        order.hops[2].pools[0].swap.qty = BigNumber.from(0)
        order.hops[2].pools[0].swap.limitPrice = maxSqrtPrice()
        
        await test2.snapStart()
        await test3.snapStart()
        await test.testOrder(order)

        expect(await test.price()).to.be.gt(toSqrtPrice(1.5))
        expect(await test2.price()).to.be.gt(toSqrtPrice(0.5))
        expect(await test3.price()).to.be.gt(toSqrtPrice(4.0))

        expect(await test.snapBaseOwed()).to.equal(15021)        
        expect(await test.snapQuoteOwed()).to.equal(0)
        expect(await test2.snapBaseOwed()).to.equal(0)        
        expect(await test2.snapQuoteOwed()).to.equal(0)
        expect(await test3.snapBaseOwed()).to.equal(0)        
        expect(await test3.snapQuoteOwed()).to.equal(-4989)
    })
})

describe('Pair roll triangle', () => {
    let test: TestPool
    let test2: TestPool
    let test3: TestPool
    const feeRate = 0
    
    beforeEach("deploy",  async () => {
        let tests = await makeTokenTriangle()
        test = tests[0]
        test2 = tests[1]
        test3 = tests[2]

       await test.initPool(feeRate, 0, 1, 1.0)
       await test2.initPool(feeRate, 0, 1, 1.0)
       await test3.initPool(feeRate, 0, 1, 1.0)
    })

   it("triangle arb", async() => {
        await test.testMintAmbient(10000)
        await test2.testMintAmbient(20000)
        await test3.testMintAmbient(30000)

        // Create a mispricing
        await test.testSwap(false, true, 100000, minSqrtPrice())
        
        let order = await test.prototypeOrder()
        let order2 = await test2.prototypeOrder()
        let order3 = await test3.prototypeOrder()
        
        order.hops.push(order2.hops[0])
        order.hops.push(order3.hops[0])

        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = false
        order.hops[0].pools[0].swap.qty = BigNumber.from(10000)
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        
        order.hops[1].settlement = order2.hops[0].settlement
        order.hops[1].pools[0].swap.isBuy = true
        order.hops[1].pools[0].swap.inBaseQty = true
        order.hops[1].pools[0].swap.qty = BigNumber.from(0)
        order.hops[1].pools[0].swap.limitPrice = maxSqrtPrice()

        order.hops[2].settlement = order3.open
        order.hops[2].pools[0].swap.isBuy = false
        order.hops[2].pools[0].swap.inBaseQty = false
        order.hops[2].pools[0].swap.qty = BigNumber.from(0)
        order.hops[2].pools[0].swap.limitPrice = minSqrtPrice()
        
        await test2.snapStart()
        await test3.snapStart()
        await test.testOrder(order)

        expect(await test.snapBaseOwed()).to.equal(-156)        
        expect(await test.snapQuoteOwed()).to.equal(0)
        expect(await test2.snapBaseOwed()).to.equal(0)        
        expect(await test2.snapQuoteOwed()).to.equal(0)
        expect(await test3.snapBaseOwed()).to.equal(-156)        
        expect(await test3.snapQuoteOwed()).to.equal(0)
    })

    it("roll surplus", async() => {
        await test.testMintAmbient(10000)
        await test2.testMintAmbient(20000)
        await test3.testMintAmbient(30000)

        // Create a mispricing
        await test.testSwap(false, true, 100000, minSqrtPrice())
        
        let order = await test.prototypeOrder()
        let order2 = await test2.prototypeOrder()
        let order3 = await test3.prototypeOrder()
        
        order.hops.push(order2.hops[0])
        order.hops.push(order3.hops[0])

        // This should set up so that we burn a position in pair one, but convert
        // the collateral to the token outside the pair.
        order.open.useSurplus = true
        order.hops[0].pools[0].passive.ambient.isAdd = false
        order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(1000)
        
        order.hops[1].settlement = order2.hops[0].settlement
        order.hops[1].pools[0].swap.isBuy = false
        order.hops[1].pools[0].swap.inBaseQty = true
        order.hops[1].pools[0].swap.qty = BigNumber.from(0)
        order.hops[1].pools[0].swap.limitPrice = maxSqrtPrice()

        order.hops[2].settlement = order3.open
        order.hops[2].settlement.useSurplus = true
        order.hops[2].pools[0].chain.rollExit = true
        order.hops[2].pools[0].chain.offsetSurplus = true        
        order.hops[2].pools[0].swap.isBuy = false
        order.hops[2].pools[0].swap.inBaseQty = true
        order.hops[2].pools[0].swap.qty = BigNumber.from(0)
        order.hops[2].pools[0].swap.limitPrice = maxSqrtPrice()
        
        await test2.snapStart()
        await test3.snapStart()
        await test.testOrder(order)

        expect(await test.snapBaseOwed()).to.equal(0)        
        expect(await test.snapQuoteOwed()).to.equal(0)
        expect(await test2.snapBaseOwed()).to.equal(0)        
        expect(await test2.snapQuoteOwed()).to.equal(-1989)
        expect(await test3.snapBaseOwed()).to.equal(0)        
        expect(await test3.snapQuoteOwed()).to.equal(-1989)
    })

    it("roll surplus diff sides", async() => {
        await test.testMintAmbient(10000)
        await test2.testMintAmbient(20000)
        await test3.testMintAmbient(30000)

        // Create a mispricing
        await test.testSwap(false, true, 100000, minSqrtPrice())
        
        let order = await test.prototypeOrder()
        let order2 = await test2.prototypeOrder()
        let order3 = await test3.prototypeOrder()
        
        order.hops.push(order2.hops[0])
        order.hops.push(order3.hops[0])

        // This should set up so that we burn a position in pair one, but convert
        // the collateral to the token outside the pair.
        order.open.useSurplus = true
        order.hops[0].pools[0].passive.ambient.isAdd = false
        order.hops[0].pools[0].passive.ambient.liquidity = BigNumber.from(1000)
        
        order.hops[1].settlement = order2.hops[0].settlement
        order.hops[1].pools[0].swap.isBuy = false
        order.hops[1].pools[0].swap.inBaseQty = true
        order.hops[1].pools[0].swap.qty = BigNumber.from(0)
        order.hops[1].pools[0].swap.limitPrice = maxSqrtPrice()

        order.hops[2].settlement = order3.open
        order.hops[2].settlement.useSurplus = true
        order.hops[2].pools[0].chain.rollExit = true
        order.hops[2].pools[0].chain.offsetSurplus = true        
        order.hops[2].pools[0].swap.isBuy = false
        order.hops[2].pools[0].swap.inBaseQty = true
        order.hops[2].pools[0].swap.qty = BigNumber.from(0)
        order.hops[2].pools[0].swap.limitPrice = maxSqrtPrice()
        
        await test2.snapStart()
        await test3.snapStart()
        await test.testOrder(order)

        expect(await test.snapBaseOwed()).to.equal(0)        
        expect(await test.snapQuoteOwed()).to.equal(0)
        expect(await test2.snapBaseOwed()).to.equal(0)        
        expect(await test2.snapQuoteOwed()).to.equal(-1989)
        expect(await test3.snapBaseOwed()).to.equal(0)        
        expect(await test3.snapQuoteOwed()).to.equal(-1989)
    })
})
