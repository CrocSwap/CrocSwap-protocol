import { TestPool, makeTokenPool, Token, POOL_IDX, createWbera } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, MAX_PRICE, MIN_PRICE } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber, BigNumberish } from 'ethers';
import { CrocImpact, WBERA } from '../typechain';

chai.use(solidity);

describe('Query Impact', () => {
    let pool: TestPool
    let test: CrocImpact
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100
    let wbera: WBERA

    before(async () => {
        wbera = await createWbera()
    })
    beforeEach("deploy",  async () => {
       pool = await makeTokenPool(wbera)
       baseToken = await pool.base
       quoteToken = await pool.quote

       pool.useHotPath = true
       pool.liqQty = true
       await pool.initPool(feeRate, 0, 1, 1.5)

       let factory = await ethers.getContractFactory("CrocImpact")
       test = await factory.deploy((await pool.dex).address) as CrocImpact
    })

    interface ImpactResult {
        baseFlow: number,
        quoteFlow: number,
        finalPrice: number
    }

    async function calcSlip (qty: BigNumberish, isBuy: boolean, inBaseQty: boolean): 
        Promise<ImpactResult> {
        let slip = await test.calcImpact(baseToken.address, quoteToken.address, POOL_IDX, 
            isBuy, inBaseQty, qty, 0, isBuy ? MAX_PRICE : MIN_PRICE)
        return { baseFlow: slip.baseFlow.toNumber(), quoteFlow: slip.quoteFlow.toNumber(),
            finalPrice: fromSqrtPrice(slip.finalPrice) }
    }

    it("small buy", async() => {  
        await pool.testMintAmbient(50000)

        let slip = await calcSlip(10000, true, true)

        await pool.testSwap(true, true, 10000, MAX_PRICE)
        expect(await pool.snapBaseFlow()).to.eq(slip.baseFlow)
        expect(await pool.snapQuoteFlow()).to.eq(slip.quoteFlow)
        expect(fromSqrtPrice(await pool.price())).to.eq(slip.finalPrice)
    })

    it("small sell", async() => {  
        await pool.testMintAmbient(50000)

        let slip = await calcSlip(10000, false, true)

        await pool.testSwap(false, true, 10000, MIN_PRICE)
        expect(await pool.snapBaseFlow()).to.eq(slip.baseFlow)
        expect(await pool.snapQuoteFlow()).to.eq(slip.quoteFlow)
        expect(fromSqrtPrice(await pool.price())).to.eq(slip.finalPrice)
    })

    it("buy denom", async() => {  
        await pool.testMintAmbient(50000)

        let slip = await calcSlip(10000, true, false)

        await pool.testSwap(true, false, 10000, MAX_PRICE)
        expect(await pool.snapBaseFlow()).to.eq(slip.baseFlow)
        expect(await pool.snapQuoteFlow()).to.eq(slip.quoteFlow)
        expect(fromSqrtPrice(await pool.price())).to.eq(slip.finalPrice)
    })

    it("sell denom", async() => {  
        await pool.testMintAmbient(50000)

        let slip = await calcSlip(10000, false, false)

        await pool.testSwap(false, false, 10000, MIN_PRICE)
        expect(await pool.snapBaseFlow()).to.eq(slip.baseFlow)
        expect(await pool.snapQuoteFlow()).to.eq(slip.quoteFlow)
        expect(fromSqrtPrice(await pool.price())).to.eq(slip.finalPrice)
    })

    it("large buy", async() => {  
        await pool.testMintAmbient(5000)

        let slip = await calcSlip(1000000, true, true)

        await pool.testSwap(true, true, 1000000, MAX_PRICE)
        expect(await pool.snapBaseFlow()).to.eq(slip.baseFlow)
        expect(await pool.snapQuoteFlow()).to.eq(slip.quoteFlow)
        expect(fromSqrtPrice(await pool.price())).to.eq(slip.finalPrice)
    })

    it("large sell", async() => {  
        await pool.testMintAmbient(5000)

        let slip = await calcSlip(1000000, false, true)

        await pool.testSwap(false, true, 1000000, MIN_PRICE)
        expect(await pool.snapBaseFlow()).to.eq(slip.baseFlow)
        expect(await pool.snapQuoteFlow()).to.eq(slip.quoteFlow)
        expect(fromSqrtPrice(await pool.price())).to.eq(slip.finalPrice)
    })

    it("bump ticks", async() => {
        await pool.testMintAmbient(50000)
        await pool.testMint(4000, 4090, 5000)

        let slip = await calcSlip(8000000, false, true)

        await pool.testSwap(false, true, 8000000, MIN_PRICE)
        expect(await pool.snapBaseFlow()).to.eq(slip.baseFlow)
        expect(await pool.snapQuoteFlow()).to.eq(slip.quoteFlow)
        expect(fromSqrtPrice(await pool.price())).to.eq(slip.finalPrice)
    })

    it("multiple bump ticks", async() => {
        await pool.testMintAmbient(50000)
        await pool.testMint(4000, 4090, 5000)
        await pool.testMint(1500, 2000, 5000)

        let slip = await calcSlip(28000000, false, true)

        await pool.testSwap(false, true, 28000000, MIN_PRICE)
        expect(await pool.snapBaseFlow()).to.eq(slip.baseFlow)
        expect(await pool.snapQuoteFlow()).to.eq(slip.quoteFlow)
        expect(fromSqrtPrice(await pool.price())).to.eq(slip.finalPrice)
    })
})
