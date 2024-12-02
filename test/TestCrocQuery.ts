import { TestPool, makeTokenPool, Token, POOL_IDX } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, ZERO_ADDR } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { CrocQuery } from '../typechain';

chai.use(solidity);

describe('CrocQuery', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100
    let trader: string
    let query: CrocQuery

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = false;

       query = await test.query
       trader = await (await test.trader).getAddress()

       const knockoutFlag = 64 + 32 + 5 // Enabled, on grid, 32-ticks wide
       await test.testRevisePool(feeRate, 0, 1, 0, knockoutFlag)

    })

    const MINT_BUFFER = 4

    it("ambient pos tokens", async() => {
        await test.testMintAmbient(10000)

        let base = await (await test.snapBaseOwed()).sub(MINT_BUFFER)
        let quote = await (await test.snapQuoteOwed()).sub(MINT_BUFFER)

        let result = await query.queryAmbientTokens(trader, 
            baseToken.address, quoteToken.address, POOL_IDX)
        
        expect(result.liq).to.eq(10000*1024)
        expect(result.baseQty).to.eq(base)
        expect(result.quoteQty).to.eq(quote)        
    })

    it("range pos tokens", async() => {
        await test.testMint(3000, 5000, 10000);

        let base = await (await test.snapBaseOwed()).sub(MINT_BUFFER)
        let quote = await (await test.snapQuoteOwed()).sub(MINT_BUFFER)

        let result = await query.queryRangeTokens(trader, 
            baseToken.address, quoteToken.address, POOL_IDX, 3000, 5000)
        
        expect(result.liq).to.eq(10000*1024)
        expect(result.baseQty).to.eq(base)
        expect(result.quoteQty).to.eq(quote)
    })

    it("range out-of-range below pos tokens", async() => {
        await test.testMint(0, 3000, 10000);

        let base = await (await test.snapBaseOwed()).sub(MINT_BUFFER)
        let quote = await (await test.snapQuoteOwed()).sub(MINT_BUFFER)

        let result = await query.queryRangeTokens(trader, 
            baseToken.address, quoteToken.address, POOL_IDX, 0, 3000)
        
        expect(result.liq).to.eq(10000*1024)
        expect(result.baseQty).to.eq(base)
        expect(result.quoteQty).to.eq(0)
    })

    it("range out-of-range above pos tokens", async() => {
        await test.testMint(6000, 8000, 10000);

        const CONVEX_ADJ = 1

        let base = await (await test.snapBaseOwed()).sub(MINT_BUFFER)
        let quote = await (await test.snapQuoteOwed()).sub(MINT_BUFFER)

        let result = await query.queryRangeTokens(trader, 
            baseToken.address, quoteToken.address, POOL_IDX, 6000, 8000)
        
        expect(result.liq).to.eq(10000*1024)
        expect(result.baseQty).to.eq(0)
        expect(result.quoteQty).to.eq(quote.add(CONVEX_ADJ))
    })

    it("range rewards tokens", async() => {
        await test.testMintAmbient(1024);
        await test.testMint(6000, 8000, 100);

        for (let i = 0; i < 5; ++i) {
            await test.testSwap(true, false, 10000000, toSqrtPrice(2.0))
            await test.testSwap(false, false, 10000000, toSqrtPrice(1.5))
        }

        let result = await query.queryConcRewards(trader, 
            baseToken.address, quoteToken.address, POOL_IDX, 6000, 8000)
        
        expect(result.liqRewards).to.eq(520)
        expect(result.baseRewards).to.eq(636)
        expect(result.quoteRewards).to.eq(424)
    })

    it("knockout pivot tokens", async() => {
        await test.testKnockoutMint(1000, true, 3200, 3200+32, false)
        let timestamp = (await hre.ethers.provider.getBlock("latest")).timestamp

        let result = await query.queryKnockoutPivot(baseToken.address, quoteToken.address,
            POOL_IDX, true, 3200)

        const liqLots = 516
        const tickWidth = 32

        expect(result.lots).to.eq(liqLots)
        expect(result.pivot).to.eq(timestamp)
        expect(result.range).to.eq(tickWidth)
    })

    it("pre-knockout pos tokens", async() => {
        await test.testKnockoutMint(1000, true, 3200, 3200+32, false)
        let pivot = (await hre.ethers.provider.getBlock("latest")).timestamp

        let CONVEX_ADJ = 3

        let base = await (await test.snapBaseOwed()).sub(MINT_BUFFER)
        let quote = await (await test.snapQuoteOwed()).sub(MINT_BUFFER)

        let result = await query.queryKnockoutTokens(trader, 
            baseToken.address, quoteToken.address, POOL_IDX,  pivot, true, 3200, 3200+32)

        expect(result.liq).to.eq(516 * 1024)
        expect(result.baseQty).to.eq(base.sub(CONVEX_ADJ))
        expect(result.quoteQty).to.eq(0)
        expect(result.knockedOut).to.eq(false)
    })

    it("post-knockout pos tokens", async() => {
        await test.testMintAmbient(10*1024)
        await test.testKnockoutMint(1000, true, 3200, 3200+32, false)
        let pivot = (await hre.ethers.provider.getBlock("latest")).timestamp

        await test.testSwap(false, true, 10000000, toSqrtPrice(1.0))
        await test.testSwap(true, true, 10000000, toSqrtPrice(1.5))

        let result = await query.queryKnockoutTokens(trader, 
            baseToken.address, quoteToken.address, POOL_IDX,  pivot, true, 3200, 3200+32)

        expect(result.liq).to.eq(516 * 1024)
        expect(result.baseQty).to.eq(0)
        expect(result.quoteQty).to.eq(720)
        expect(result.knockedOut).to.eq(true)
    })

})
