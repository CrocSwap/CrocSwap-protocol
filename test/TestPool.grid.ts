import { TestPool, makeTokenPool, Token } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { ConcentratedDirective } from './EncodeOrder';
import { BigNumber } from 'ethers';

chai.use(solidity);

describe('Pool Grid', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 0

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 15, 1.5)
       test.useHotPath = false
    })

    it("grid required", async() => {
        await expect(test.testMint(14, 30, 1000)).to.be.reverted
        await expect(test.testMint(300, 316, 1000)).to.be.reverted
        await expect(test.testMint(-164, -150, 1000)).to.be.reverted
        await expect(test.testMint(-1516, -1470, 1000)).to.be.reverted
        await test.testMint(-1500, -1200, 1000)
        await test.testMint(3030, 6030, 1000)
        await test.testMint(-15, 4500, 2000)
        
        expect(await test.liquidity()).to.eq(3000*1024)
    })

    it("grid required hotpath", async() => {
        test.useHotPath = true
        await expect(test.testMint(14, 30, 1000)).to.be.reverted
        await expect(test.testMint(300, 316, 1000)).to.be.reverted
        await expect(test.testMint(-164, -150, 1000)).to.be.reverted
        await expect(test.testMint(-1516, -1470, 1000)).to.be.reverted
        await test.testMint(-1500, -1200, 1000)
        await test.testMint(3030, 6030, 1000)
        await test.testMint(-15, 4500, 2000)
        
        expect(await test.liquidity()).to.eq(3000*1024)
    })

    it("grid revised", async() => {
        await test.testMint(3030, 6030, 1000)
        await test.testRevisePool(feeRate, 0, 50)
        await expect(test.testMint(3030, 6030, 1000)).to.be.reverted
        await expect(test.testMint(3050, 6050, 1000))
        expect(await test.liquidity()).to.eq(1000*1024)        
    })

    it("burn after revised", async() => {
        await test.testMint(3030, 6030, 1000)
        await test.testRevisePool(feeRate, 0, 50)
        await expect(test.testMint(3030, 6030, 1000)).to.be.reverted

        await test.testBurn(3030, 6030, 400)
        expect(await test.liquidity()).to.eq(600*1024)        
        await test.testBurn(3030, 6030, 600)
        expect(await test.liquidity()).to.eq(0*1024)        
    })

    it("burn after revised hotpath", async() => {
        test.useHotPath = true
        await test.testMint(3030, 6030, 1000)
        await test.testRevisePool(feeRate, 0, 50)
        await expect(test.testMint(3030, 6030, 1000)).to.be.reverted

        await test.testBurn(3030, 6030, 400)
        expect(await test.liquidity()).to.eq(600*1024)        
        await test.testBurn(3030, 6030, 600)
        expect(await test.liquidity()).to.eq(0*1024)      
    })

    it("price improve - no settings", async() => {
        let order = await test.prototypeOrder()

        let concen: ConcentratedDirective = {
            openTick: 3030,
            bookends: [{closeTick: 6030, isAdd: true, liquidity: BigNumber.from(1000*1024)}]
        }
        order.hops[0].pools[0].passive.concentrated.push(concen)
        order.hops[0].improve.isEnabled = true
        order.hops[0].improve.useBaseSide = true
        
        await test.testOrder(order)
        expect(await test.liquidity()).to.eq(1000*1024)  

        order.hops[0].pools[0].passive.concentrated[0].openTick = 6031
        await expect(test.testOrder(order)).to.be.reverted

        order.hops[0].improve.useBaseSide = false
        await expect(test.testOrder(order)).to.be.reverted
    })

    it("price improve - settings", async() => {
        await test.testPegPriceImprove(10000, 1000)

        let order = await test.prototypeOrder()

        // Collateral thresh is about 18k of liquidity
        let concen: ConcentratedDirective = {
            openTick: 3801,
            bookends: [{closeTick: 4200, isAdd: true, liquidity: BigNumber.from(18000*1024)}]
        }
        order.hops[0].pools[0].passive.concentrated.push(concen)
        order.hops[0].improve.isEnabled = true
        order.hops[0].improve.useBaseSide = true
        
        await test.testOrder(order)
        expect(await test.liquidity()).to.eq(18000*1024)  

        order.hops[0].pools[0].passive.concentrated[0].bookends[0].liquidity = BigNumber.from(16000*1024)
        await expect(test.testOrder(order)).to.be.reverted
    })


    it("price improve burn full", async() => {
        await test.testPegPriceImprove(10000, 1000)
        let order = await test.prototypeOrder()

        // Collateral thresh is about 18k of liquidity
        let concen: ConcentratedDirective = {
            openTick: 3801,
            bookends: [{closeTick: 4200, isAdd: true, liquidity: BigNumber.from(18000*1024)}]
        }
        order.hops[0].pools[0].passive.concentrated.push(concen)
        order.hops[0].improve.isEnabled = true
        order.hops[0].improve.useBaseSide = true
        
        await test.testOrder(order)

        order.hops[0].pools[0].passive.concentrated[0].bookends[0].liquidity = BigNumber.from(18000*1024)
        order.hops[0].pools[0].passive.concentrated[0].bookends[0].isAdd = false
        await test.testOrder(order)
        expect(await test.liquidity()).to.eq(0) 
    })

    it("price improve burn partial", async() => {
        await test.testPegPriceImprove(10000, 1000)
        let order = await test.prototypeOrder()

        // Collateral thresh is about 18k of liquidity
        let concen: ConcentratedDirective = {
            openTick: 3801,
            bookends: [{closeTick: 4200, isAdd: true, liquidity: BigNumber.from(18000*1024)}]
        }
        order.hops[0].pools[0].passive.concentrated.push(concen)
        order.hops[0].improve.isEnabled = true
        order.hops[0].improve.useBaseSide = true
        
        await test.testOrder(order)

        order.hops[0].pools[0].passive.concentrated[0].bookends[0].liquidity = BigNumber.from(17999*1024)
        order.hops[0].pools[0].passive.concentrated[0].bookends[0].isAdd = false
        expect(test.testOrder(order)).to.be.reverted
    })

    it("price improve burn hot path", async() => {
        await test.testPegPriceImprove(10000, 1000)
        let order = await test.prototypeOrder()

        // Collateral thresh is about 18k of liquidity
        let concen: ConcentratedDirective = {
            openTick: 3801,
            bookends: [{closeTick: 4200, isAdd: true, liquidity: BigNumber.from(18000*1024)}]
        }
        order.hops[0].pools[0].passive.concentrated.push(concen)
        order.hops[0].improve.isEnabled = true
        order.hops[0].improve.useBaseSide = true
        
        await test.testOrder(order)

        test.useHotPath = true
        await expect(test.testBurn(3801, 4200, 1024)).to.be.reverted

        await test.testBurn(3801, 4200, 18000)
        expect(await test.liquidity()).to.eq(0) 
    })

    it("price improve - quote side", async() => {
        // Set to 1/1.5 the threshold of the previous test, should be consistent threshold
        await test.testPegPriceImproveQuote(6667, 1000)

        let order = await test.prototypeOrder()

        // Collateral thresh is about 18k of liquidity
        let concen: ConcentratedDirective = {
            openTick: 3801,
            bookends: [{closeTick: 4200, isAdd: true, liquidity: BigNumber.from(18000*1024)}]
        }
        order.hops[0].pools[0].passive.concentrated.push(concen)
        order.hops[0].improve.isEnabled = true
        order.hops[0].improve.useBaseSide = false
        
        await test.testOrder(order)
        expect(await test.liquidity()).to.eq(18000*1024)  

        order.hops[0].pools[0].passive.concentrated[0].bookends[0].liquidity = BigNumber.from(16000*1024)
        await expect(test.testOrder(order)).to.be.reverted
    })

    it("price improve - away", async() => {
        await test.testPegPriceImproveQuote(6667, 1000)

        let order = await test.prototypeOrder()

        // Collateral thresh is about 18k of liquidity
        let concen: ConcentratedDirective = {
            openTick: 3801,
            bookends: [{closeTick: 4200, isAdd: true, liquidity: BigNumber.from(18000*1024)}]
        }
        order.hops[0].pools[0].passive.concentrated.push(concen)
        order.hops[0].improve.isEnabled = true
        order.hops[0].improve.useBaseSide = false
        
        await test.testOrder(order)
        expect(await test.liquidity()).to.eq(18000*1024)  

        // Tighten away ticks
        await test.testPegPriceImproveQuote(6667, 100)
        await expect(test.testOrder(order)).to.be.reverted
    })

    it("price improve - wrong base side", async() => {
        await test.testPegPriceImproveQuote(6667, 1000)

        let order = await test.prototypeOrder()

        // Collateral thresh is about 18k of liquidity
        let concen: ConcentratedDirective = {
            openTick: 3801,
            bookends: [{closeTick: 4200, isAdd: true, liquidity: BigNumber.from(100000*1024)}]
        }
        order.hops[0].pools[0].passive.concentrated.push(concen)
        order.hops[0].improve.isEnabled = true
        order.hops[0].improve.useBaseSide = true
        
        await expect(test.testOrder(order)).to.be.reverted
    })

    it("price improve - wrong quote side", async() => {
        await test.testPegPriceImprove(10000, 1000)

        let order = await test.prototypeOrder()

        // Collateral thresh is about 18k of liquidity
        let concen: ConcentratedDirective = {
            openTick: 3801,
            bookends: [{closeTick: 4200, isAdd: true, liquidity: BigNumber.from(100000*1024)}]
        }
        order.hops[0].pools[0].passive.concentrated.push(concen)
        order.hops[0].improve.isEnabled = true
        order.hops[0].improve.useBaseSide = false
        
        await expect(test.testOrder(order)).to.be.reverted
    })
})
