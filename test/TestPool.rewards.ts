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

    // Repeat swaps inside a price range of 1.0 to 2.0 to accumulate fees for any
    // LP positions in that range
    async function accumFees (nRounds = 5) {
        for (let i = 0; i < nRounds; ++i) {
            await test.testSwap(true, false, 100000000, toSqrtPrice(2.0))
            await test.testSwap(false, false, 100000000, toSqrtPrice(1.0))
        }

        await test.testSwap(true, false, 100000000, toSqrtPrice(1.5))
    }

    // Pre-initialize the curve with some liquidity and accumulated fees
    async function preWarmCurve() {
        await test.testMintAmbient(1000)
        await test.testMint(-25000, 25000, 1000)

        await accumFees(1)
    }

    /* Tests simple rewards accumulation for a single LP position on freshly
     * initialized ticks. */
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

    /* Tests rewards accumulation is correctly blended for multiple mints on the 
     * same LP position, made at two different fee accumulation starting points. */
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

    /* Tests that partial burns of an LP position correctly returns pro-rata rewards
     * in propotion to the percentage of liquidity removed. */
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

    /* Test reward accumulation on an LP position on a fresh curve with no previously initialized
     * liquidity to verify any boundary conditions related to zero curve accumulator starting point. */
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

    /* Tests that once harvested, rewards are reset on an LP position, preventing "double-harvest"
     * of the same rewards. */
    it("harvest resets", async() => {
        await preWarmCurve()

        await test.testMint(0, 10000, 1000)
        await accumFees()
        await test.testHarvest(0, 10000)
        await test.testHarvest(0, 10000)

        // The second harvest should return no fees
        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.eq(0)
        expect(quoteFlow).to.eq(0)

        // Fees should keep accumulating again from the new accumulator point even if
        // harvest was reset
        await accumFees()
        await test.testHarvest(0, 10000)
        baseFlow = await test.snapBaseOwed()
        quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.eq(-221779)
        expect(quoteFlow).to.eq(-147852)
    })

    /* Tests that curve rewards occuring below the lower boundary of a range LP position do not
     * result in accumulated rewards */
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

    /* Tests that curve rewards occuring above the upper boundary of a range LP position do not
     * result in accumulated rewards */
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

    /* Test that harvest works correctly even for an LP position that's accumulated fees
     * but is now out of range below the curve price. */
    it("on curve tick upper", async() => {
        await preWarmCurve()

        // The ending price of the curve after accumFees is 1.5, which corresponds to
        // a tick value of 4054
        await test.testMint(-1000, 4054, 1)
        await accumFees()
        await test.testHarvest(-1000, 4054)

        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.lt(0)
        expect(quoteFlow).to.lt(0)
    })

    /* Test that harvest works correctly even for an LP position that's accumulated fees
     * but is now out of range below the curve price. */
    it("on curve tick lower", async() => {
        await preWarmCurve()

        // The ending price of the curve after accumFees is 1.5, which corresponds to
        // a tick value of 4054
        await test.testMint(4054, 10000, 1)
        await accumFees()
        await test.testHarvest(4054, 10000)

        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.lt(0)
        expect(quoteFlow).to.lt(0)
    })


    /* Test that fee accumulation happens correctly, even if the lower tick of the LP position
     * was previously initialized and the upper tick is fresh. */
    it("rewards pre-init lower tick", async() => {
        await preWarmCurve()

        await test.testMint(-25000, 10000, 1000)
        await accumFees()
        await test.testHarvest(-25000, 10000)

        // Verify that LP posittion has accumulated rewards and is not zero
        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.lt(0)
        expect(quoteFlow).to.lt(0)
    })

    /* Test that fee accumulation happens correctly, even if the upper tick of the LP position
     * was previously initialized and the lower tick is fresh. */
    it("rewards pre-init upper tick", async() => {
        await preWarmCurve()

        await test.testMint(0, 25000, 1000)
        await accumFees()
        await test.testHarvest(0, 25000)

        // Verify that LP posittion has accumulated rewards and is not zero
        let baseFlow = await test.snapBaseOwed()
        let quoteFlow = await test.snapQuoteOwed()
        expect(baseFlow).to.lt(0)
        expect(quoteFlow).to.lt(0)
    })

})
