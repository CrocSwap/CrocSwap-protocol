import { TestPool, makeTokenPool, Token, makeEtherPool } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, ZERO_ADDR } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber, ContractFactory } from 'ethers';
import { HotProxy } from '../typechain';

chai.use(solidity);

describe('Swap Router Bilateral', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = false;
       test.useSwapProxy.router = true

       let factory = await ethers.getContractFactory("HotProxy") as ContractFactory
       let hotProxy = await factory.deploy() as HotProxy
       
       await test.base.approve(await test.trader, (await test.router).address, 100000000000)
       await test.quote.approve(await test.trader, (await test.router).address, 100000000000)
       await test.testUpgradeHotProxy(await hotProxy.address)
    })

    it("swap simple", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 93172
        const counterFlow = -6620437

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

    it("swap exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = -6620437

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().add(1)
        expect(test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))).to.be.reverted
    })
    
    it("swap protocol fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testRevisePool(feeRate, 43, 1)

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(true, true, 10000, toSqrtPrice(2.0))

        const swapFlow = 6603 + 57
        const feeCost = 148
        const liqBonus = 1
        const liqGrowth = 74
        const counterFlow = -(swapFlow - feeCost + liqBonus)

        expect(await test.snapBaseFlow()).to.equal(10000)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10000)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(0)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(25)
    })

    it("swap sell", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 94828
        const counterFlow = 7039007

        await test.snapStart()
        test.slippage = BigNumber.from(10000000)
        await test.testSwap(false,  true, 10000*1024, toSqrtPrice(1.25))
        expect(await test.snapBaseFlow()).to.equal(-10000*1024)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-10000*1024)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.47533)
        expect(price).to.lte(1.47534)
    })

    it("swap sell exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = 7039007

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().sub(1)
        expect(test.testSwap(false,  true, 10000*1024, toSqrtPrice(1.25))).to.be.reverted
    })

    it("swap sell protocol fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testRevisePool(feeRate, 43, 1)
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 78901
        const counterFlow = 7038793

        await test.snapStart()
        test.slippage = BigNumber.from(10000000)
        await test.testSwap(false, true, 10000*1024, toSqrtPrice(1.25))
        expect(await test.snapBaseFlow()).to.equal(-10000*1024)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-10000*1024)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(0)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(25*1024 + 412)
    })

    it("swap wrong direction", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.snapStart()
        await expect((test.testSwap(false, true, 10000*1024, toSqrtPrice(1.55)))).to.be.reverted
        await expect((test.testSwap(true, false, 5000, toSqrtPrice(1.4)))).to.be.reverted
    })

    it("swap buy quote output", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
                
        const liqGrowth = 142856
        const counterFlow = 15904766

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow)
        await test.testSwap(true, false, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(-10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.53785)
        expect(price).to.lte(1.53786)
    })

    it("swap buy quote exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = 15904766

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().sub(1)
        expect(test.testSwap(true, false, 10000*1024, toSqrtPrice(2.0))).to.be.reverted
    })

    it("swap sell quote output", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
                
        const liqGrowth = 138168
        const counterFlow = -14839765

        await test.snapStart()
        await test.testSwap(false, false, 10000*1024, toSqrtPrice(1.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.46431)
        expect(price).to.lte(1.46432)
    })

    it("swap sell quote exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = -14839765

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().add(1)
        expect(test.testSwap(false, false, 10000*1024, toSqrtPrice(1.0))).to.be.reverted
    })

    it("swap buy quote proto fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testRevisePool(feeRate, 43, 1)
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 118824
        const counterFlow = 15904022

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow)
        await test.testSwap(true, false, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(-10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)
    })

    it("swap limit", async() => {
        await test.testMint(-5000, 8000, 40); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        let limitFlow = 7852
        let counterFlow = -4426
        let liqGrowth = 1019

        await test.snapStart()
        await test.testSwap(true, true, 100000, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.999999)
        expect(price).to.lte(2.0)
    })

    it("swap tick step", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(true, true, 100000*1024, toSqrtPrice(2.0))

        let limitFlow = 9284916
        let counterFlow = -5343553
        let liqGrowth = 76488

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.999999)
        expect(price).to.lte(2.0)
    })

    it("swap tick sell", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(false, false, 100000*1024, toSqrtPrice(1.25))

        let limitFlow = -5595724
        let counterFlow = 4117800
        let liqGrowth = 53143

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.249999)
        expect(price).to.lte(1.25)
    })

    it("swap tick protocol fee", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 
        await test.testRevisePool(feeRate, 43, 1)

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        let x = await test.testSwap(false, false, 100000*1024, toSqrtPrice(1.25))

        let limitFlow = -5584330
        let counterFlow = 4109814
        let liqGrowth = 44215

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(21377)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(0)
    })

    it("swap surplus collateral", async() => {
        await test.testMint(-5000, 8000, 1000000); 

        let sender = await (await test.trader).getAddress() 

        await test.testCollectSurplus(await test.trader, sender, -100000, baseToken.address, false)
        await test.testCollectSurplus(await test.trader, sender, -250000, quoteToken.address, false)

        await expect(test.testSwapSurplus(true, true, 1000, toSqrtPrice(2.0))).to.be.reverted
        await expect(test.testSwapSurplus(false, true, 1000, toSqrtPrice(1.0))).to.be.reverted
        await expect(test.testSwapSurplus(true, false, 1000, toSqrtPrice(2.0))).to.be.reverted
        await expect(test.testSwapSurplus(false, false, 1000, toSqrtPrice(1.0))).to.be.reverted
    })
})

describe('Swap Router Bilateral Eth', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeEtherPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = false;
       test.useSwapProxy.router = true

       let factory = await ethers.getContractFactory("HotProxy") as ContractFactory
       let hotProxy = await factory.deploy() as HotProxy
       
       await test.base.approve(await test.trader, (await test.router).address, 100000000000)
       await test.quote.approve(await test.trader, (await test.router).address, 100000000000)
       await test.testUpgradeHotProxy(await hotProxy.address)
    })

    it("swap simple", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 93172
        const counterFlow = -6620437

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

    it("swap exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = -6620437

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().add(1)
        expect(test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))).to.be.reverted
    })
    
    it("swap protocol fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testRevisePool(feeRate, 43, 1)

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(true, true, 10000, toSqrtPrice(2.0))

        const swapFlow = 6603 + 57
        const feeCost = 148
        const liqBonus = 1
        const liqGrowth = 74
        const counterFlow = -(swapFlow - feeCost + liqBonus)

        expect(await test.snapBaseFlow()).to.equal(10000)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10000)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(0)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(25)
    })

    it("swap sell", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 94828
        const counterFlow = 7039007

        await test.snapStart()
        test.slippage = BigNumber.from(10000000)
        await test.testSwap(false,  true, 10000*1024, toSqrtPrice(1.25))
        expect(await test.snapBaseFlow()).to.equal(-10000*1024)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-10000*1024)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.47533)
        expect(price).to.lte(1.47534)
    })

    it("swap sell exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = 7039007

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().sub(1)
        expect(test.testSwap(false,  true, 10000*1024, toSqrtPrice(1.25))).to.be.reverted
    })

    it("swap sell protocol fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testRevisePool(feeRate, 43, 1)
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 78901
        const counterFlow = 7038793

        await test.snapStart()
        test.slippage = BigNumber.from(10000000)
        await test.testSwap(false, true, 10000*1024, toSqrtPrice(1.25))
        expect(await test.snapBaseFlow()).to.equal(-10000*1024)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-10000*1024)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(0)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(25*1024 + 412)
    })

    it("swap wrong direction", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.snapStart()
        await expect((test.testSwap(false, true, 10000*1024, toSqrtPrice(1.55)))).to.be.reverted
        await expect((test.testSwap(true, false, 5000, toSqrtPrice(1.4)))).to.be.reverted
    })

    it("swap buy quote output", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
                
        const liqGrowth = 142856
        const counterFlow = 15904766

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow)
        await test.testSwap(true, false, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(-10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.53785)
        expect(price).to.lte(1.53786)
    })

    it("swap buy quote exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = 15904766

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().sub(1)
        expect(test.testSwap(true, false, 10000*1024, toSqrtPrice(2.0))).to.be.reverted
    })

    it("swap sell quote output", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
                
        const liqGrowth = 138168
        const counterFlow = -14839765

        await test.snapStart()
        await test.testSwap(false, false, 10000*1024, toSqrtPrice(1.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.46431)
        expect(price).to.lte(1.46432)
    })

    it("swap sell quote exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = -14839765

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().add(1)
        expect(test.testSwap(false, false, 10000*1024, toSqrtPrice(1.0))).to.be.reverted
    })

    it("swap buy quote proto fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testRevisePool(feeRate, 43, 1)
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 118824
        const counterFlow = 15904022

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow)
        await test.testSwap(true, false, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(-10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)
    })

    it("swap limit", async() => {
        await test.testMint(-5000, 8000, 40); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        let limitFlow = 7852
        let counterFlow = -4426
        let liqGrowth = 1019

        await test.snapStart()
        await test.testSwap(true, true, 100000, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.999999)
        expect(price).to.lte(2.0)
    })

    it("swap tick step", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(true, true, 100000*1024, toSqrtPrice(2.0))

        let limitFlow = 9284916
        let counterFlow = -5343553
        let liqGrowth = 76488

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.999999)
        expect(price).to.lte(2.0)
    })

    it("swap tick sell", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(false, false, 100000*1024, toSqrtPrice(1.25))

        let limitFlow = -5595724
        let counterFlow = 4117800
        let liqGrowth = 53143

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.249999)
        expect(price).to.lte(1.25)
    })

    it("swap tick protocol fee", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 
        await test.testRevisePool(feeRate, 43, 1)

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        let x = await test.testSwap(false, false, 100000*1024, toSqrtPrice(1.25))

        let limitFlow = -5584330
        let counterFlow = 4109814
        let liqGrowth = 44215

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(21377)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(0)
    })

    it("swap surplus collateral", async() => {
        await test.testMint(-5000, 8000, 1000000); 

        let sender = await (await test.trader).getAddress() 

        await test.testCollectSurplus(await test.trader, sender, -100000, baseToken.address, false)
        await test.testCollectSurplus(await test.trader, sender, -250000, quoteToken.address, false)

        await expect(test.testSwapSurplus(true, true, 1000, toSqrtPrice(2.0))).to.be.reverted
        await expect(test.testSwapSurplus(false, true, 1000, toSqrtPrice(1.0))).to.be.reverted
        await expect(test.testSwapSurplus(true, false, 1000, toSqrtPrice(2.0))).to.be.reverted
        await expect(test.testSwapSurplus(false, false, 1000, toSqrtPrice(1.0))).to.be.reverted
    })
})

describe('Swap Router Bypass', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = false;
       test.useSwapProxy.bypass = true

       let factory = await ethers.getContractFactory("HotProxy") as ContractFactory
       let hotProxy = await factory.deploy() as HotProxy
       
       await test.base.approve(await test.trader, (await test.router).address, 100000000000)
       await test.quote.approve(await test.trader, (await test.router).address, 100000000000)
       await test.testUpgradeHotProxy(await hotProxy.address)

       await test.testApproveRouter(await test.trader, (await test.routerBypass).address,
        1000000, [test.HOT_PROXY])
    })

    it("swap simple", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 93172
        const counterFlow = -6620437

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

    it("swap exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = -6620437

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().add(1)
        expect(test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))).to.be.reverted
    })
    
    it("swap protocol fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testRevisePool(feeRate, 43, 1)

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(true, true, 10000, toSqrtPrice(2.0))

        const swapFlow = 6603 + 57
        const feeCost = 148
        const liqBonus = 1
        const liqGrowth = 74
        const counterFlow = -(swapFlow - feeCost + liqBonus)

        expect(await test.snapBaseFlow()).to.equal(10000)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10000)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(0)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(25)
    })

    it("swap sell", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 94828
        const counterFlow = 7039007

        await test.snapStart()
        test.slippage = BigNumber.from(10000000)
        await test.testSwap(false,  true, 10000*1024, toSqrtPrice(1.25))
        expect(await test.snapBaseFlow()).to.equal(-10000*1024)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-10000*1024)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.47533)
        expect(price).to.lte(1.47534)
    })

    it("swap sell exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = 7039007

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().sub(1)
        expect(test.testSwap(false,  true, 10000*1024, toSqrtPrice(1.25))).to.be.reverted
    })

    it("swap sell protocol fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testRevisePool(feeRate, 43, 1)
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 78901
        const counterFlow = 7038793

        await test.snapStart()
        test.slippage = BigNumber.from(10000000)
        await test.testSwap(false, true, 10000*1024, toSqrtPrice(1.25))
        expect(await test.snapBaseFlow()).to.equal(-10000*1024)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-10000*1024)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(0)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(25*1024 + 412)
    })

    it("swap wrong direction", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.snapStart()
        await expect((test.testSwap(false, true, 10000*1024, toSqrtPrice(1.55)))).to.be.reverted
        await expect((test.testSwap(true, false, 5000, toSqrtPrice(1.4)))).to.be.reverted
    })

    it("swap buy quote output", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
                
        const liqGrowth = 142856
        const counterFlow = 15904766

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow)
        await test.testSwap(true, false, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(-10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.53785)
        expect(price).to.lte(1.53786)
    })

    it("swap buy quote exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = 15904766

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().sub(1)
        expect(test.testSwap(true, false, 10000*1024, toSqrtPrice(2.0))).to.be.reverted
    })

    it("swap sell quote output", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
                
        const liqGrowth = 138168
        const counterFlow = -14839765

        await test.snapStart()
        await test.testSwap(false, false, 10000*1024, toSqrtPrice(1.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.46431)
        expect(price).to.lte(1.46432)
    })

    it("swap sell quote exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = -14839765

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().add(1)
        expect(test.testSwap(false, false, 10000*1024, toSqrtPrice(1.0))).to.be.reverted
    })

    it("swap buy quote proto fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testRevisePool(feeRate, 43, 1)
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 118824
        const counterFlow = 15904022

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow)
        await test.testSwap(true, false, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(-10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)
    })

    it("swap limit", async() => {
        await test.testMint(-5000, 8000, 40); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        let limitFlow = 7852
        let counterFlow = -4426
        let liqGrowth = 1019

        await test.snapStart()
        await test.testSwap(true, true, 100000, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.999999)
        expect(price).to.lte(2.0)
    })

    it("swap tick step", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(true, true, 100000*1024, toSqrtPrice(2.0))

        let limitFlow = 9284916
        let counterFlow = -5343553
        let liqGrowth = 76488

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.999999)
        expect(price).to.lte(2.0)
    })

    it("swap tick sell", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(false, false, 100000*1024, toSqrtPrice(1.25))

        let limitFlow = -5595724
        let counterFlow = 4117800
        let liqGrowth = 53143

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.249999)
        expect(price).to.lte(1.25)
    })

    it("swap tick protocol fee", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 
        await test.testRevisePool(feeRate, 43, 1)

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        let x = await test.testSwap(false, false, 100000*1024, toSqrtPrice(1.25))

        let limitFlow = -5584330
        let counterFlow = 4109814
        let liqGrowth = 44215

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(21377)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(0)
    })

    it("swap surplus collateral", async() => {
        await test.testMint(-5000, 8000, 1000000); 

        let sender = await (await test.trader).getAddress() 

        await test.testCollectSurplus(await test.trader, sender, -100000, baseToken.address, false)
        await test.testCollectSurplus(await test.trader, sender, -250000, quoteToken.address, false)

        await test.testSwapSurplus(true, true, 1000, toSqrtPrice(2.0))
        expect(await test.price()).to.gt(toSqrtPrice(1.5))
        expect(await test.snapBaseOwed()).to.equal(0)
        expect(await test.snapQuoteOwed()).to.equal(0)

        expect(await (await test.query).querySurplus(sender, baseToken.address)).to.equal(100000-1000)
        expect(await (await test.query).querySurplus(sender, quoteToken.address)).to.equal(250000+648)
    })
})

describe('Swap Router Bypass Eth', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeEtherPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = false;
       test.useSwapProxy.bypass = true

       let factory = await ethers.getContractFactory("HotProxy") as ContractFactory
       let hotProxy = await factory.deploy() as HotProxy
       
       await test.base.approve(await test.trader, (await test.router).address, 100000000000)
       await test.quote.approve(await test.trader, (await test.router).address, 100000000000)
       await test.testUpgradeHotProxy(await hotProxy.address)

       await test.testApproveRouter(await test.trader, (await test.routerBypass).address,
        1000000, [test.HOT_PROXY])
    })

    it("swap simple", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 93172
        const counterFlow = -6620437

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

    it("swap exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = -6620437

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().add(1)
        expect(test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))).to.be.reverted
    })
    
    it("swap protocol fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testRevisePool(feeRate, 43, 1)

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(true, true, 10000, toSqrtPrice(2.0))

        const swapFlow = 6603 + 57
        const feeCost = 148
        const liqBonus = 1
        const liqGrowth = 74
        const counterFlow = -(swapFlow - feeCost + liqBonus)

        expect(await test.snapBaseFlow()).to.equal(10000)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10000)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(0)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(25)
    })

    it("swap sell", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 94828
        const counterFlow = 7039007

        await test.snapStart()
        test.slippage = BigNumber.from(10000000)
        await test.testSwap(false,  true, 10000*1024, toSqrtPrice(1.25))
        expect(await test.snapBaseFlow()).to.equal(-10000*1024)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-10000*1024)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.47533)
        expect(price).to.lte(1.47534)
    })

    it("swap sell exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = 7039007

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().sub(1)
        expect(test.testSwap(false,  true, 10000*1024, toSqrtPrice(1.25))).to.be.reverted
    })

    it("swap sell protocol fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testRevisePool(feeRate, 43, 1)
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 78901
        const counterFlow = 7038793

        await test.snapStart()
        test.slippage = BigNumber.from(10000000)
        await test.testSwap(false, true, 10000*1024, toSqrtPrice(1.25))
        expect(await test.snapBaseFlow()).to.equal(-10000*1024)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-10000*1024)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(0)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(25*1024 + 412)
    })

    it("swap wrong direction", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.snapStart()
        await expect((test.testSwap(false, true, 10000*1024, toSqrtPrice(1.55)))).to.be.reverted
        await expect((test.testSwap(true, false, 5000, toSqrtPrice(1.4)))).to.be.reverted
    })

    it("swap buy quote output", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
                
        const liqGrowth = 142856
        const counterFlow = 15904766

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow)
        await test.testSwap(true, false, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(-10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.53785)
        expect(price).to.lte(1.53786)
    })

    it("swap buy quote exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = 15904766

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().sub(1)
        expect(test.testSwap(true, false, 10000*1024, toSqrtPrice(2.0))).to.be.reverted
    })

    it("swap sell quote output", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
                
        const liqGrowth = 138168
        const counterFlow = -14839765

        await test.snapStart()
        await test.testSwap(false, false, 10000*1024, toSqrtPrice(1.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.46431)
        expect(price).to.lte(1.46432)
    })

    it("swap sell quote exceeds slippage", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        const counterFlow = -14839765

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow).abs().add(1)
        expect(test.testSwap(false, false, 10000*1024, toSqrtPrice(1.0))).to.be.reverted
    })

    it("swap buy quote proto fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testRevisePool(feeRate, 43, 1)
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 118824
        const counterFlow = 15904022

        await test.snapStart()
        test.slippage = BigNumber.from(counterFlow)
        await test.testSwap(true, false, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(-10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)
    })

    it("swap limit", async() => {
        await test.testMint(-5000, 8000, 40); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        let limitFlow = 7852
        let counterFlow = -4426
        let liqGrowth = 1019

        await test.snapStart()
        await test.testSwap(true, true, 100000, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.999999)
        expect(price).to.lte(2.0)
    })

    it("swap tick step", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(true, true, 100000*1024, toSqrtPrice(2.0))

        let limitFlow = 9284916
        let counterFlow = -5343553
        let liqGrowth = 76488

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.999999)
        expect(price).to.lte(2.0)
    })

    it("swap tick sell", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(false, false, 100000*1024, toSqrtPrice(1.25))

        let limitFlow = -5595724
        let counterFlow = 4117800
        let liqGrowth = 53143

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.249999)
        expect(price).to.lte(1.25)
    })

    it("swap tick protocol fee", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 
        await test.testRevisePool(feeRate, 43, 1)

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        let x = await test.testSwap(false, false, 100000*1024, toSqrtPrice(1.25))

        let limitFlow = -5584330
        let counterFlow = 4109814
        let liqGrowth = 44215

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(21377)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(0)
    })

    it("swap surplus collateral", async() => {
        await test.testMint(-5000, 8000, 1000000); 

        let sender = await (await test.trader).getAddress() 

        await test.testCollectSurplus(await test.trader, sender, -100000, baseToken.address, false)
        await test.testCollectSurplus(await test.trader, sender, -250000, quoteToken.address, false)

        await test.testSwapSurplus(true, true, 1000, toSqrtPrice(2.0))
        expect(await test.price()).to.gt(toSqrtPrice(1.5))
        expect(await test.snapBaseOwed()).to.equal(0)
        expect(await test.snapQuoteOwed()).to.equal(0)

        expect(await (await test.query).querySurplus(sender, baseToken.address)).to.equal(100000-1000)
        expect(await (await test.query).querySurplus(sender, quoteToken.address)).to.equal(250000+648)
    })
})