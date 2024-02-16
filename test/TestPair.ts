import { TestPool, makeTokenPool, Token, POOL_IDX, createWbera } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber } from 'ethers';
import { ConcentratedDirective } from './EncodeOrder';
import { WBERA } from '../typechain';

chai.use(solidity);

describe('Pair', () => {
    let test: TestPool
    const feeRate = 0
    const pool2 = 48395
    const pool3 = 5934

    let wbera: WBERA

    before(async () => {
        wbera = await createWbera()
    })


    beforeEach("deploy",  async () => {
       test = await makeTokenPool(wbera)

       let fstPoolIdx = test.poolIdx 
       await test.initPool(feeRate, 0, 1, 1.5)
       await test.initPoolIdx(pool2, feeRate, 0, 10, 1.7)
       await test.initPoolIdx(pool3, feeRate, 0, 6, 1.4)
       test.poolIdx = fstPoolIdx
    })

    it("two pool arbitrage", async() => {
        await test.testMintAmbient(10000)
        await test.testMintAmbientIdx(20000, pool2)
        
        let order = await test.prototypeOrder()

        order.hops[0].pools[0].chain.swapDefer = true  
        order.hops[0].pools.push(Object.assign({}, order.hops[0].pools[0]))
        order.hops[0].pools[1].swap = Object.assign({}, order.hops[0].pools[0].swap)

        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = true
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(100000)    

        order.hops[0].pools[1].poolIdx = pool2
        order.hops[0].pools[1].swap.isBuy = false
        order.hops[0].pools[1].swap.inBaseQty = true
        order.hops[0].pools[1].swap.limitPrice = minSqrtPrice()
        order.hops[0].pools[1].swap.qty = BigNumber.from(100000)  

        await test.testOrder(order)

        expect(fromSqrtPrice(await test.price())).to.gt(1.5)
        expect(fromSqrtPrice(await test.price())).to.lt(1.55)
        expect(fromSqrtPrice(await test.priceIdx(pool2))).to.lt(1.7)
        expect(fromSqrtPrice(await test.priceIdx(pool2))).to.gt(1.65)

        expect(await test.liquidity()).equal(10000*1024)
        expect(await test.liquidityIdx(pool2)).equal(20000*1024)
        
        expect(await test.snapBaseOwed()).to.equal(0)        
        expect(await test.snapQuoteOwed()).to.equal(-7080)
    })

    it("two pool arbitrage quote", async() => {
        await test.testMintAmbient(10000)
        await test.testMintAmbientIdx(20000, pool2)
        
        let order = await test.prototypeOrder()

        order.hops[0].pools[0].chain.swapDefer = true  
        order.hops[0].pools.push(Object.assign({}, order.hops[0].pools[0]))
        order.hops[0].pools[1].swap = Object.assign({}, order.hops[0].pools[0].swap)

        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = false
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(100000)    

        order.hops[0].pools[1].poolIdx = pool2
        order.hops[0].pools[1].swap.isBuy = false
        order.hops[0].pools[1].swap.inBaseQty = false
        order.hops[0].pools[1].swap.limitPrice = minSqrtPrice()
        order.hops[0].pools[1].swap.qty = BigNumber.from(100000)  

        await test.testOrder(order)

        expect(fromSqrtPrice(await test.price())).to.gt(1.5)
        expect(fromSqrtPrice(await test.price())).to.lt(1.55)
        expect(fromSqrtPrice(await test.priceIdx(pool2))).to.lt(1.7)
        expect(fromSqrtPrice(await test.priceIdx(pool2))).to.gt(1.65)

        expect(await test.liquidity()).equal(10000*1024)
        expect(await test.liquidityIdx(pool2)).equal(20000*1024)
        
        expect(await test.snapBaseOwed()).to.equal(-17091)        
        expect(await test.snapQuoteOwed()).to.equal(0)
    })

    it("three pools stacked flow", async() => {
        await test.testMintAmbient(10000)
        await test.testMintAmbientIdx(20000, pool2)
        await test.testMintAmbientIdx(30000, pool3)
        
        let order = await test.prototypeOrder(3)
        order.hops[0].pools[0].chain.swapDefer = true          
        
        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = false
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(100000)    

        order.hops[0].pools[1].poolIdx = pool2
        order.hops[0].pools[1].swap.isBuy = false
        order.hops[0].pools[1].swap.inBaseQty = false
        order.hops[0].pools[1].swap.limitPrice = minSqrtPrice()
        order.hops[0].pools[1].swap.qty = BigNumber.from(100000)  

        order.hops[0].pools[2].poolIdx = pool3
        order.hops[0].pools[2].passive.ambient.isAdd = true
        order.hops[0].pools[2].passive.ambient.liquidity = BigNumber.from(50*1024)

        await test.testOrder(order)

        expect(fromSqrtPrice(await test.price())).to.gt(1.5)
        expect(fromSqrtPrice(await test.price())).to.lt(1.55)
        expect(fromSqrtPrice(await test.priceIdx(pool2))).to.lt(1.7)
        expect(fromSqrtPrice(await test.priceIdx(pool2))).to.gt(1.65)
        expect(await test.priceIdx(pool3)).to.eq(toSqrtPrice(1.4))

        expect(await test.liquidity()).equal(10000*1024)
        expect(await test.liquidityIdx(pool2)).equal(20000*1024)
        expect(await test.liquidityIdx(pool3)).equal(30000*1024 + 50*1024)
        
        expect(await test.snapBaseOwed()).to.equal(43493)        
        expect(await test.snapQuoteOwed()).to.equal(43275)
    })

    it("protocol fee baseline", async() => {
        await test.testMintAmbient(10000)
        await test.testMintAmbientIdx(20000, pool2)
        await test.testMintAmbientIdx(30000, pool3)
        
        // Turn protocol fees on at different rates 
        await test.testRevisePool(100*100, 128, 1)
        await test.testRevisePoolIdx(pool2, 100*100, 85, 1)
        await test.testRevisePoolIdx(pool2, 50*100, 64, 1)

        let order = await test.prototypeOrder(3)
        
        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = false
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(100000)    

        await test.testOrder(order)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(759)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(0)
    })

    it("protocol fee stack both sides", async() => {
        await test.testMintAmbient(10000)
        await test.testMintAmbientIdx(20000, pool2)
        await test.testMintAmbientIdx(30000, pool3)
        
        // Turn protocol fees on at different rates 
        await test.testRevisePool(100*100, 128, 1)
        await test.testRevisePoolIdx(pool2, 100*100, 85, 1)
        await test.testRevisePoolIdx(pool3, 50*100, 64, 1)

        let order = await test.prototypeOrder(3)
        
        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = false
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(100000)    

        order.hops[0].pools[1].poolIdx = pool2
        order.hops[0].pools[1].swap.isBuy = true
        order.hops[0].pools[1].swap.inBaseQty = true
        order.hops[0].pools[1].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[1].swap.qty = BigNumber.from(100000)    

        await test.testOrder(order)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(759)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(192)
    })

    it("protocol fee stack base", async() => {
        await test.testMintAmbient(10000)
        await test.testMintAmbientIdx(20000, pool2)
        await test.testMintAmbientIdx(30000, pool3)
        
        // Turn protocol fees on at different rates 
        await test.testRevisePool(100*100, 128, 1)
        await test.testRevisePoolIdx(pool2, 100*100, 85, 1)
        await test.testRevisePoolIdx(pool3, 50*100, 64, 1)

        let order = await test.prototypeOrder(3)
        
        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = false
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(100000)    

        order.hops[0].pools[1].poolIdx = pool2
        order.hops[0].pools[1].swap.isBuy = true
        order.hops[0].pools[1].swap.inBaseQty = true
        order.hops[0].pools[1].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[1].swap.qty = BigNumber.from(100000)   

        order.hops[0].pools[2].poolIdx = pool3
        order.hops[0].pools[2].swap.isBuy = true
        order.hops[0].pools[2].swap.inBaseQty = true
        order.hops[0].pools[2].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[2].swap.qty = BigNumber.from(100000)  

        await test.testOrder(order)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(759)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(281)
    })

    it("protocol fee stack quote", async() => {
        await test.testMintAmbient(10000)
        await test.testMintAmbientIdx(20000, pool2)
        await test.testMintAmbientIdx(30000, pool3)
        
        // Turn protocol fees on at different rates 
        await test.testRevisePool(100*100, 128, 1)
        await test.testRevisePoolIdx(pool2, 100*100, 85, 1)
        await test.testRevisePoolIdx(pool3, 50*100, 64, 1)

        let order = await test.prototypeOrder(3)
        
        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = false
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(100000)    

        order.hops[0].pools[1].poolIdx = pool2
        order.hops[0].pools[1].swap.isBuy = true
        order.hops[0].pools[1].swap.inBaseQty = true
        order.hops[0].pools[1].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[1].swap.qty = BigNumber.from(100000)   

        order.hops[0].pools[2].poolIdx = pool3
        order.hops[0].pools[2].swap.isBuy = true
        order.hops[0].pools[2].swap.inBaseQty = false
        order.hops[0].pools[2].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[2].swap.qty = BigNumber.from(100000)  

        await test.testOrder(order)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(934)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(192)
    })

    it("pool settings individual", async() => {
        await test.testMintAmbient(10000)
        await test.testMintAmbientIdx(20000, pool2)
        await test.testMintAmbientIdx(30000, pool3)
        
        let order = await test.prototypeOrder(3)

        let concenOffGrid: ConcentratedDirective = {
            lowTick: 3001, isRelTick: false,
            highTick: 5001, isAdd: true, liquidity: BigNumber.from(1000*1024)
        }

        let concenTenGrid: ConcentratedDirective = {
            lowTick: 1000, isRelTick: false,
            highTick: 9000, isAdd: true, liquidity: BigNumber.from(2000*1024)
        }

        let concenSixGrid: ConcentratedDirective = {
            lowTick: 3000, isRelTick: false,
            highTick: 5004, isAdd: true, liquidity: BigNumber.from(3000*1024)
        }

        order.hops[0].pools[1].poolIdx = pool2
        order.hops[0].pools[2].poolIdx = pool3
        
        order.hops[0].pools[0].passive.concentrated.push(concenOffGrid)
        order.hops[0].pools[1].passive.concentrated.push(concenTenGrid)
        order.hops[0].pools[2].passive.concentrated.push(concenSixGrid)
        
        // This should execute because each range order lands on its respective grid
        await test.testOrder(order)

        expect(await test.liquidity()).equal(11000*1024)
        expect(await test.liquidityIdx(pool2)).equal(22000*1024)
        expect(await test.liquidityIdx(pool3)).equal(33000*1024)

        // This should fail because we're adding range orders that don't match their
        // specific pool's grid.
        order.hops[0].pools[1].passive.concentrated[0] = concenSixGrid
        order.hops[0].pools[2].passive.concentrated[0] = concenTenGrid
        await expect(test.testOrder(order)).to.be.reverted
    })
})