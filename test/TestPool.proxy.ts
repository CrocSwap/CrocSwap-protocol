import { TestPool, makeTokenPool, Token } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { HotProxy } from '../typechain/HotProxy';
import { ContractFactory } from 'ethers';
import { MockHotProxy } from '../typechain/MockHotProxy';

chai.use(solidity);

// Just a copy of the pool unit tests, but with hot path enabled
describe('Pool HotPath Proxy', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    let hotProxy: HotProxy
    let mockProxy: MockHotProxy
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = true
       test.useSwapProxy.base = true;

       let factory = await ethers.getContractFactory("HotProxy") as ContractFactory
       hotProxy = await factory.deploy() as HotProxy

       factory = await ethers.getContractFactory("MockHotProxy") as ContractFactory
       mockProxy = await factory.deploy() as MockHotProxy
    })

    it("swap no proxy", async() => {
        await test.testMint(-5000, 8000, 1000000);         
        // Will fail because proxy hasn't been set.
        await expect(test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))).to.be.reverted
    })

    it("swap proxy", async() => {
        await test.testUpgradeHotProxy(hotProxy.address)

        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 93172
        const counterFlow = -6620438

        await test.snapStart()
        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(10240000)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10240000)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.524317)
        expect(price).to.lte(1.524318)
    })

    it("swap proxy optional", async() => {
        test.useSwapProxy.base = false
        await test.testUpgradeHotProxy(hotProxy.address, false)

        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 93172
        const counterFlow = -6620438

        await test.snapStart()
        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(10240000)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)
    })

    it("swap force proxy", async() => {
        await test.testUpgradeHotProxy(hotProxy.address, true)
        await test.testMint(-5000, 8000, 1000000); 
        test.useSwapProxy.base = false
        await expect(test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))).to.be.reverted
    })

    it("swap long path okay", async() => {
        test.useSwapProxy.base = false
        test.useHotPath = false
        await test.testUpgradeHotProxy(hotProxy.address, true)

        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)        
        const counterFlow = -6620438
        
        await test.snapStart()
        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10240000)
    })

    it("swap optimal no proxy", async() => {
        test.useSwapProxy.optimal = true
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 93172
        const counterFlow = -6620438

        await test.snapStart()
        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(10240000)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10240000)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.524317)
        expect(price).to.lte(1.524318)
    })

    it("swap optimal proxy", async() => {
        test.useSwapProxy.optimal = true
        await test.testUpgradeHotProxy(hotProxy.address, true)

        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)        
        const counterFlow = -6620438

        await test.snapStart()
        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10240000)
    })

    it("swap optimal proxy optional", async() => {
        test.useSwapProxy.optimal = true
        await test.testUpgradeHotProxy(hotProxy.address, false)

        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)        
        const counterFlow = -6620438

        await test.snapStart()
        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10240000)
    })

    it("swap optimal proxy call check", async() => {
        test.useSwapProxy.optimal = true
        await test.testUpgradeHotProxy(mockProxy.address, true)

        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)        
        
        // MockHotProxy implementaiton should not change the price
        await test.snapStart()
        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(0)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(0)
    })

    it("swap optimal proxy embedded", async() => {
        test.useSwapProxy.optimal = true
        await test.testUpgradeHotProxy(mockProxy.address, false)

        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)        
        const counterFlow = -6620438

        await test.snapStart()
        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10240000)
    })
})
