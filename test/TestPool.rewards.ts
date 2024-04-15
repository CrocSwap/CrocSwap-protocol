import { TestPool, makeTokenPool, Token } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';

chai.use(solidity);

// Just a copy of the pool unit tests, but with hot path enabled
describe('Pool LP Rewards', () => {
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

    async function accumFees (nRounds = 5) {
        for (let i = 0; i < nRounds; ++i) {
            await test.testSwap(true, false, 100000000, toSqrtPrice(2.0))
            await test.testSwap(false, false, 100000000, toSqrtPrice(1.0))
        }

        await test.testSwap(true, false, 100000000, toSqrtPrice(1.5))
    }

    async function preWarmCurve() {
        await test.testMintAmbient(1000)
        await test.testMint(-25000, 25000, 1000)

        await accumFees(1)
    }

    it("rewards growth", async() => {
        await preWarmCurve()

        await test.testMint(0, 10000, 1000)
        await accumFees()
        await test.testHarvest(0, 10000)

        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.eq(-221780)
        expect(quoteFlow).to.eq(-147853)
    })

    it("rewards blend mint", async() => {
        await preWarmCurve()

        await test.testMint(0, 10000, 1000)
        await accumFees()
        await test.testMint(0, 10000, 2000)
        await test.testHarvest(0, 10000)

        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.eq(-221780)
        expect(quoteFlow).to.eq(-147853)
    })

    it("rewards pro rata burn", async() => {
        await preWarmCurve()

        await test.testMint(0, 10000, 1000)
        await accumFees()
        await test.testMint(0, 10000, 2000)
        await test.testBurn(0, 10000, 2000)
        await test.testHarvest(0, 10000)

        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.eq(-73881)
        expect(quoteFlow).to.eq(-49254)
    })

    it("rewards growth zero curve", async() => {
        await test.testMintAmbient(1000)
        await test.testMint(-25000, 25000, 1000)

        await test.testMint(0, 10000, 1000)
        await accumFees()
        await test.testHarvest(0, 10000)

        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.eq(-221780)
        expect(quoteFlow).to.eq(-147853)
    })

    it("harvest resets", async() => {
        await preWarmCurve()

        await test.testMint(0, 10000, 1000)
        await accumFees()
        await test.testHarvest(0, 10000)
        await test.testHarvest(0, 10000)

        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.eq(0)
        expect(quoteFlow).to.eq(0)

        await accumFees()
        await test.testHarvest(0, 10000)
        baseFlow = await test.snapBaseOwed()
        quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.eq(-221779)
        expect(quoteFlow).to.eq(-147852)
    })

    it("no rewards below range", async() => {
        await preWarmCurve()

        await test.testMint(-1000, -100, 1)
        await accumFees()
        await test.testHarvest(-1000, -100)

        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.eq(0)
        expect(quoteFlow).to.eq(0)
    })

    it("no rewards above range", async() => {
        await preWarmCurve()

        await test.testMint(-1000, -100, 1)
        await accumFees()
        await test.testHarvest(100000, 110000)

        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.eq(0)
        expect(quoteFlow).to.eq(0)
    })

    it("on curve tick upper", async() => {
        await preWarmCurve()

        await test.testMint(-1000, 4054, 1)
        await accumFees()
        await test.testHarvest(-1000, 4054)

        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.lt(0)
        expect(quoteFlow).to.lt(0)
    })

    it("on curve tick lower", async() => {
        await preWarmCurve()

        await test.testMint(4054, 10000, 1)
        await accumFees()
        await test.testHarvest(4054, 10000)

        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.lt(0)
        expect(quoteFlow).to.lt(0)
    })


    it("rewards pre-init lower tick", async() => {
        await preWarmCurve()

        await test.testMint(-25000, 10000, 1000)
        await accumFees()
        await test.testHarvest(-25000, 10000)

        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.lt(0)
        expect(quoteFlow).to.lt(0)
    })

    it("rewards pre-init upper tick", async() => {
        await preWarmCurve()

        await test.testMint(0, 25000, 1000)
        await accumFees()
        await test.testHarvest(0, 25000)

        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.lt(0)
        expect(quoteFlow).to.lt(0)
    })

})
