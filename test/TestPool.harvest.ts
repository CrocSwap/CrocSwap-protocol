import { TestPool, makeTokenPool, Token } from '../test/FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from '../test/FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';

chai.use(solidity);

describe('Pool Harvest', () => {
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

    it("harvest rewards", async() => {
        await test.testMint(-10000, 25000, 1000000);

        // Estabilish the pre-reward collateral commitment...
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        // Collect rewards and bring back to original price
        await test.testSwap(true, true, 10000, toSqrtPrice(1.7))
        await test.testSwap(false, false, 100000, toSqrtPrice(1.5))

        startQuote = await quoteToken.balanceOf((await test.dex).address)
        startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testHarvest(-10000, 25000)
        // The expected amounts harvested
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-144)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-216)
    })

    it("harvest deplete", async() => {
        await test.testMint(-10000, 25000, 1000000);

        // Collect rewards and bring back to original price
        await test.testSwap(true, true, 10000, toSqrtPrice(1.7))
        await test.testSwap(false, false, 100000, toSqrtPrice(1.5))

        await test.testHarvest(-10000, 25000)

        // Subsequent harvests should no longer have any rewards to collect
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testHarvest(-10000, 25000)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(0)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(0)
    })

    // it("burn deplete", async() => {
    //     await test.testMint(-10000, 25000, 1000000);

    //     // Estabilish the pre-reward collateral commitment...
    //     let startQuote = await quoteToken.balanceOf((await test.dex).address)
    //     let startBase = await baseToken.balanceOf((await test.dex).address)
    //     await test.testBurn(-10000, 25000, 100000)
    //     let collateralBase = ((await baseToken.balanceOf((await test.dex).address)).sub(startBase))
    //     let collateralQuote = ((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote))

    //     // Collect rewards and bring back to original price
    //     await test.testSwap(true, true, 10000, toSqrtPrice(1.7))
    //     await test.testSwap(false, false, 100000, toSqrtPrice(1.5))

    //     await test.testHarvest(-10000, 25000)

    //     // Subsequent burns should collect rewards at same rate.
    //     startQuote = await quoteToken.balanceOf((await test.dex).address)
    //     startBase = await baseToken.balanceOf((await test.dex).address)
    //     await test.testBurn(-10000, 25000, 100000)
    //     // The formula below backs out the rewards portion of the burn
    //     expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote).sub(collateralQuote)).to.equal(0)
    //     expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase).sub(collateralBase)).to.equal(0)
    // })

    it("harvest re-fill", async() => {
        await test.testMint(-10000, 25000, 1000000);

        // Collect rewards and bring back to original price
        await test.testSwap(true, true, 10000, toSqrtPrice(1.7))
        await test.testSwap(false, false, 100000, toSqrtPrice(1.5))

        await test.testHarvest(-10000, 25000)

        // Refill rewards
        await test.testSwap(true, true, 10000, toSqrtPrice(1.7))
        await test.testSwap(false, false, 100000, toSqrtPrice(1.5))

        // Subsequent harvests should no longer have any rewards to collect
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testHarvest(-10000, 25000)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-144)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-216)
    })
})
