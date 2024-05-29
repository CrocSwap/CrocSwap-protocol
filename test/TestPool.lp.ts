import { TestPool, makeTokenPool, Token } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber } from 'ethers';
import { TestUniCompat } from '../typechain';

chai.use(solidity);

// Just a copy of the pool unit tests, but with hot path enabled
describe('Pool Warm LP Path', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = true
       test.liqQty = true
    })

    it("mint ambient base", async() => {
        test.liqBase = true
        await test.testMintAmbient(5000)

        let flow = await test.snapBaseOwed()
        expect(flow).to.eq(5000*1024)
    })

    it("mint ambient quote", async() => {
        test.liqBase = false        
        await test.testMintAmbient(5000)
        
        let flow = await test.snapQuoteOwed()
        expect(flow).to.eq(5000*1024)
    })

    it("burn ambient base", async() => {
        test.liqBase = true
        await test.testMintAmbient(5000)
        await test.testBurnAmbient(2500)

        let flow = await test.snapBaseOwed()
        expect(flow).to.gte(-2500*1024 - 5)
        expect(flow).to.lte(-2500*1024)
    })

    it("burn ambient quote", async() => {
        test.liqBase = false        
        await test.testMintAmbient(5000)
        await test.testBurnAmbient(2500)

        let flow = await test.snapQuoteOwed()
        expect(flow).to.gte(-2500*1024 - 5)
        expect(flow).to.lte(-2500*1024)
    })

    it("mint conc base", async() => {
        test.liqBase = true
        await test.testMint(3000, 5000, 10000)

        let flow = await test.snapBaseOwed()
        expect(flow).to.eq(10000*1024)
    })

    it("mint conc qutoe", async() => {
        test.liqBase = false
        await test.testMint(3000, 5000, 10000)

        let flow = await test.snapQuoteOwed()
        expect(flow).to.eq(10000*1024)
    })

    it("burn conc base", async() => {
        test.liqBase = true
        await test.testMint(3000, 5000, 10000)
        await test.testBurn(3000, 5000, 5000)
        
        let flow = await test.snapBaseOwed()
        expect(flow).to.gte(-5000*1024 - 1024)
        expect(flow).to.lte(-5000*1024)
    })

    it("burn conc quoe", async() => {
        test.liqBase = false
        await test.testMint(3000, 5000, 10000)
        await test.testBurn(3000, 5000, 5000)

        let flow = await test.snapQuoteOwed()
        expect(flow).to.gte(-5000*1024 - 1024)
        expect(flow).to.lte(-5000*1024)
    })

    it("out of range base", async() => {
        test.liqBase = true
        await test.testMint(0, 3000, 10000)

        let flow = await test.snapBaseOwed()
        expect(flow).to.lte(10000*1024)
        expect(flow).to.gte(10000*1024 - 1024)
        expect(await test.snapQuoteOwed()).to.eq(0)

        // Can't mint a base collateral target when range order is out of
        // range on the quote side.
        expect(test.testMint(8000, 25000, 10000)).to.be.reverted
    })

    it("out of range quote", async() => {
        test.liqBase = false
        await test.testMint(8000, 12000, 10000)

        let flow = await test.snapQuoteOwed()
        expect(flow).to.lte(10000*1024)
        expect(flow).to.gte(10000*1024 - 1024)
        expect(await test.snapBaseOwed()).to.eq(0)

        // Can't mint a base collateral target when range order is out of
        // range on the quote side.
        expect(test.testMint(2000, 3000, 10000)).to.be.reverted
    })

    

})

describe('Pool Warm Custom', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 325743212)
       test.useHotPath = true
       test.liqQty = true

       await test.fundTokens(BigNumber.from(10).pow(24))
    })

    it("mint test", async() => {
        let uniLibFactory = await ethers.getContractFactory("TestUniCompat")
        let uniLib = await uniLibFactory.deploy() as TestUniCompat

        let results = uniLib.getLiquidityForAmountsNative(
            toSqrtPrice(325743212), toSqrtPrice(295631642), toSqrtPrice(358204706),
            4546806, 1446711801938050)
        console.log(await results)

        test.liqQty = false
        await test.testMint(195056, 196976, Math.floor(1693217948365/1024))

        let quote = await test.snapQuoteOwed()
        let base = await test.snapBaseOwed()
        console.log(quote.toString())
        console.log(base.toString())
        /*expect(base).to.eq(0)
        expect(quote).to.eq(0)*/
    })
})