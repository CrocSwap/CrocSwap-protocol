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
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = true
    })

    it("over start limit", async() => {
        await test.testMint(-5000, 8000, 1000000); 

        test.startLimit = toSqrtPrice(1.49)
        await expect(test.testSwap(true, true, 100000000, toSqrtPrice(1.8))).to.be.reverted
    })

    it("inside start limit", async() => {
        await test.testMint(-5000, 8000, 1000000); 

        test.startLimit = toSqrtPrice(1.51)
        await test.testSwap(true, true, 10000000, toSqrtPrice(1.8))

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.179999)
        expect(price).to.lte(1.800000)
    })

    it("over start limit sell", async() => {
        await test.testMint(-5000, 8000, 1000000); 

        test.startLimit = toSqrtPrice(1.51)
        await expect(test.testSwap(false, true, 100000000, toSqrtPrice(1.3))).to.be.reverted
    })

    it("inside start limit sell", async() => {
        await test.testMint(-5000, 8000, 1000000); 

        test.startLimit = toSqrtPrice(1.49)
        await test.testSwap(false, true, 1000000000, toSqrtPrice(1.3))

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.299999)
        expect(price).to.lte(1.300000)
    })
})
