import { TestPool, makeTokenPool, Token } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';

chai.use(solidity);

describe('Pool Tick Boundaries', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(0, 0, 1, 1.0)
       test.useHotPath = true
    })

    // Mint liquidity exactly at the lower boundary edge of a tick, then cross back and forth
    it("at lower edge", async() => {
        await test.testMint(0, 1000, 250)

        // Liquidity minted at the lower edge of a tick is inclusive of that range
        expect (await test.liquidity()).to.eq(250*1024)

        await test.testSwap(false, true, 1000000, toSqrtPrice(0.99))
        expect (await test.liquidity()).to.eq(0)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.0))
        expect (await test.liquidity()).to.eq(250*1024)

        await test.testSwap(false, true, 1000000, toSqrtPrice(0.99))
        await test.testSwap(true, true, 1000000, toSqrtPrice(1.01))
        expect (await test.liquidity()).to.eq(250*1024)
    })
    
    // Mint liquidity exactly at the lower edge of a tick, then move price down instead of crossing
    it("lower edge first down", async() => {
        await test.testMint(0, 1000, 250)

        await test.testSwap(false, true, 1000000, toSqrtPrice(0.99))
        expect (await test.liquidity()).to.eq(0*1024)
    })

    // Mint liquidity exactly at the lower edge of a tick, then move down exactly 1 price wei
    it("lower edge first down wei", async() => {
        await test.testMint(0, 1000, 250)

        await test.testSwap(false, true, 1000000, toSqrtPrice(1.0).sub(1))
        expect (await test.liquidity()).to.eq(0*1024)
    })

    // Mint liquidity exactly 1 price wei below the lower edge of a tick
    it("below lower edge", async() => {
        await test.testSwap(false, true, 1000000, toSqrtPrice(1.0).sub(1))
        await test.testMint(0, 1000, 250)

        expect (await test.liquidity()).to.eq(0)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.01))
        expect (await test.liquidity()).to.eq(250*1024)

        await test.testSwap(false, true, 1000000, toSqrtPrice(0.99))
        expect (await test.liquidity()).to.eq(0)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.00))
        expect (await test.liquidity()).to.eq(250*1024)
    })

    // Mint liquidity exactly 1 price wei above the lower edge of a tick
    it("above lower edge", async() => {
        await test.testSwap(true, true, 1000000, toSqrtPrice(1.0).add(1))
        await test.testMint(0, 1000, 250)

        expect (await test.liquidity()).to.eq(250*1024)

        await test.testSwap(false, true, 1000000, toSqrtPrice(1.0))
        expect (await test.liquidity()).to.eq(250*1024)

        await test.testSwap(false, true, 1000000, toSqrtPrice(0.99))
        expect (await test.liquidity()).to.eq(0)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.0))
        expect (await test.liquidity()).to.eq(250*1024)

        await test.testSwap(false, true, 1000000, toSqrtPrice(0.99))
        await test.testSwap(true, true, 1000000, toSqrtPrice(1.01))
        expect (await test.liquidity()).to.eq(250*1024)
    })

    // Mint liquidity exactly at the upper boundary edge of a tick, then cross back and forth
    it("at upper edge", async() => {
        await test.testMint(-1000, 0, 250)

        // Liquidity minted at the upper edge of a tick is *not* inclusive of that range
        expect (await test.liquidity()).to.eq(0)

        await test.testSwap(false, true, 1000000, toSqrtPrice(0.99))
        expect (await test.liquidity()).to.eq(250*1024)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.0))
        expect (await test.liquidity()).to.eq(0)

        await test.testSwap(false, true, 1000000, toSqrtPrice(0.99))
        expect (await test.liquidity()).to.eq(250*1024)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.01))
        expect (await test.liquidity()).to.eq(0)
    })

    // Mint liquidity exactly at the upper edge of a tick, then move price up instead of crossing
    it("upper edge first up", async() => {
        await test.testMint(-1000, 0, 250)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.01).add(1))
        expect (await test.liquidity()).to.eq(0)
    })

    // Mint liquidity exactly at the upper edge of a tick, then move price up 1 wei
    it("upper edge first down wei", async() => {
        await test.testMint(-1000, 0, 250)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.0).add(1))
        expect (await test.liquidity()).to.eq(0)
    })

    // Mint liquidity exactly 1 price wei below the upper edge of a tick
    it("below lower edge", async() => {
        await test.testSwap(false, true, 1000000, toSqrtPrice(1.0).sub(1))
        await test.testMint(-1000, 0, 250)

        expect (await test.liquidity()).to.eq(250*1024)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.0))
        expect (await test.liquidity()).to.eq(0)

        await test.testSwap(false, true, 1000000, toSqrtPrice(1.0).sub(1))
        expect (await test.liquidity()).to.eq(250*1024)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.01))
        expect (await test.liquidity()).to.eq(0)

        await test.testSwap(false, true, 1000000, toSqrtPrice(0.99))
        expect (await test.liquidity()).to.eq(250*1024)
    })

    // Mint liquidity exactly 1 price wei above the upper edge of a tick
    it("above upper edge", async() => {
        await test.testSwap(true, true, 1000000, toSqrtPrice(1.0).add(1))
        await test.testMint(-1000, 0, 250)

        expect (await test.liquidity()).to.eq(0)

        await test.testSwap(false, true, 1000000, toSqrtPrice(1.0))
        expect (await test.liquidity()).to.eq(0)

        await test.testSwap(false, true, 1000000, toSqrtPrice(0.99))
        expect (await test.liquidity()).to.eq(250*1024)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.0))
        expect (await test.liquidity()).to.eq(0)

        await test.testSwap(false, true, 1000000, toSqrtPrice(0.99))
        expect (await test.liquidity()).to.eq(250*1024)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.01))
        expect (await test.liquidity()).to.eq(0)
    })

    it("swap to exact upper bound", async() => {
        await test.testMint(-20000, 0, 250)
        await test.testMint(0, 1000, 70)
        await test.testMint(-100000, 100000, 100)
        expect (await test.liquidity()).to.eq(170*1024)

        await test.testSwap(false, true, 1000000, toSqrtPrice(0.9))
        expect (await test.liquidity()).to.eq(350*1024)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.0))
        expect (await test.liquidity()).to.eq(170*1024)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.00001))
        expect (await test.liquidity()).to.eq(170*1024)
    })

    it("swap to exact lower bound", async() => {
        await test.testMint(-20000, 0, 250)
        await test.testMint(0, 100000, 70)
        await test.testMint(-100000, 100000, 100)
        expect (await test.liquidity()).to.eq(170*1024)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.1))
        expect (await test.liquidity()).to.eq(170*1024)

        await test.testSwap(false, true, 1000000, toSqrtPrice(1.0))
        expect (await test.liquidity()).to.eq(170*1024)

        await test.testSwap(false, true, 1000000, toSqrtPrice(0.999))
        expect (await test.liquidity()).to.eq(350*1024)
    })

    it("swap to exact lower cross", async() => {
        await test.testMint(-20000, 0, 250)
        await test.testMint(0, 100000, 70)
        await test.testMint(-100000, 100000, 100)
        expect (await test.liquidity()).to.eq(170*1024)

        await test.testSwap(true, true, 1000000, toSqrtPrice(1.1))
        expect (await test.liquidity()).to.eq(170*1024)

        await test.testSwap(false, true, 1000000, toSqrtPrice(1.0).sub(1))
        expect (await test.liquidity()).to.eq(350*1024)
    })
})
