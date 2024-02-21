import { TestPool, makeTokenPool, Token } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber } from 'ethers';

chai.use(solidity);

describe('Pool Swap', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 0

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       await test.fundTokens(BigNumber.from(10).pow(40))
       test.useHotPath = true
    })

    it("swap zero", async() => {
        await test.testMint(-5000, 8000, BigNumber.from(10).pow(24)); 
        let priceStart = await test.price()

        await test.snapStart()
        await test.testSwap(true, true, 0, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)

        let price = await test.price()
        expect(price).to.eq(priceStart)
    })

    it("swap zero sell", async() => {
        await test.testMint(-5000, 8000, BigNumber.from(10).pow(24)); 
        let priceStart = await test.price()

        await test.snapStart()
        await test.testSwap(false, true, 0, toSqrtPrice(0.5))
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)

        let price = await test.price()
        expect(price).to.eq(priceStart)
    })

    it("swap zero quote", async() => {
        await test.testMint(-5000, 8000, BigNumber.from(10).pow(24)); 
        let priceStart = await test.price()

        await test.snapStart()
        await test.testSwap(true, false, 0, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)

        let price = await test.price()
        expect(price).to.eq(priceStart)
    })

    it("swap zero sell quote", async() => {
        await test.testMint(-5000, 8000, BigNumber.from(10).pow(24)); 
        let priceStart = await test.price()

        await test.snapStart()
        await test.testSwap(false, false, 0, toSqrtPrice(0.5))
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)

        let price = await test.price()
        expect(price).to.eq(priceStart)
    })
})
