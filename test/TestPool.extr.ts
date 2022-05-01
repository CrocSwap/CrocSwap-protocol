import { TestPool, makeTokenPool, Token, makeEtherPool } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, Q_64, MAX_PRICE, MIN_PRICE } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber, ContractTransaction } from 'ethers';

chai.use(solidity);

async function getTxGUsage (tx: Promise<ContractTransaction>): Promise<BigNumber> {
    let rcpt = await (await tx).wait(1)
    return rcpt.cumulativeGasUsed
}

const COLLATERAL_BUFFER = 4

describe('Pool Extremes', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote
       test.useHotPath = true
    })

    async function gasUsed (tx: Promise<ContractTransaction>): Promise<BigNumber> {
        return tx
            .then(t => t.wait())
            .then(t => t.gasUsed)
    }

    it("zero liq", async() => {
        await test.initPool(feeRate, 0, 1, 1.0, true)
        let tx = test.testSwap(true, true, 1000, toSqrtPrice(2.0))
        await tx

        expect(await test.liquidity()).to.equal(0)
        expect((await test.price())).to.equal(toSqrtPrice(2.0))
        expect((await quoteToken.balanceOf((await test.dex).address))).to.equal(2*COLLATERAL_BUFFER)
        expect((await baseToken.balanceOf((await test.dex).address))).to.equal(2*COLLATERAL_BUFFER)
    })

    it("zero liq [@gas-test]", async() => {
        await test.initPool(feeRate, 0, 1, 1.0, true)
        let tx = test.testSwap(true, true, 1000, toSqrtPrice(2.0))
        await tx
        expect(await gasUsed(tx)).to.lte(600000)
    })

    it("zero liq sell", async() => {
        await test.initPool(feeRate, 0, 1, 1.0, true)
        let tx = test.testSwap(false, true, 1000, toSqrtPrice(0.5))
        await tx

        expect(await test.liquidity()).to.equal(0)
        expect((await test.price())).to.equal(toSqrtPrice(0.5))
        expect((await quoteToken.balanceOf((await test.dex).address))).to.equal(2*COLLATERAL_BUFFER)
        expect((await baseToken.balanceOf((await test.dex).address))).to.equal(2*COLLATERAL_BUFFER)
    })

    it("zero liq sell [@gas-test]", async() => {
        await test.initPool(feeRate, 0, 1, 1.0, true)
        let tx = test.testSwap(false, true, 1000, toSqrtPrice(0.5))
        await tx
        expect(await gasUsed(tx)).to.lte(600000)
    })

    it("init high price", async() => {
        await test.initPool(feeRate, 0, 1, MAX_PRICE, true)
        let tx = test.testSwap(false, false, 1000, MIN_PRICE)
        await tx

        expect(await test.liquidity()).to.equal(0)
        expect((await test.price())).to.equal(MIN_PRICE)
        expect((await quoteToken.balanceOf((await test.dex).address))).to.equal(2*COLLATERAL_BUFFER)
        expect((await baseToken.balanceOf((await test.dex).address))).to.equal(2*COLLATERAL_BUFFER)
    })

    it("init high price [@gas-test]", async() => {
        await test.initPool(feeRate, 0, 1, MAX_PRICE, true)
        let tx = test.testSwap(false, false, 1000, MIN_PRICE)
        await tx
        expect(await gasUsed(tx)).to.lte(620000)
    })

    it("init low price", async() => {
        await test.initPool(feeRate, 0, 1, MIN_PRICE, true)
        let tx = test.testSwap(true, true, 1000, MAX_PRICE)
        await tx

        expect(await test.liquidity()).to.equal(0)
        expect((await test.price())).to.equal(MAX_PRICE)
        expect((await quoteToken.balanceOf((await test.dex).address))).to.equal(2*COLLATERAL_BUFFER)
        expect((await baseToken.balanceOf((await test.dex).address))).to.equal(2*COLLATERAL_BUFFER)
    })

    it("init low price [@gas-test]", async() => {
        await test.initPool(feeRate, 0, 1, MIN_PRICE, true)
        let tx = test.testSwap(true, true, 1000, MAX_PRICE)
        expect(await gasUsed(tx)).to.lte(620000)
    })

    it("outside price", async() => {
        await expect(test.initPool(feeRate, 0, 1, MAX_PRICE.add(1), true)).to.be.reverted
        await expect(test.initPool(feeRate, 0, 1, MIN_PRICE.sub(1), true)).to.be.reverted

        await test.initPool(feeRate, 0, 1, 1.0, true)
        await expect(test.testSwap(true, true, 1000, MAX_PRICE.add(1))).to.be.reverted
        await expect(test.testSwap(false, true, 1000, MIN_PRICE.sub(1))).to.be.reverted
    })
})



