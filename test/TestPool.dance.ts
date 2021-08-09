import { TestPool } from '../typechain/TestPool'
import { MockFactory } from '../typechain/MockFactory'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { CrocSwapPool } from '../typechain/CrocSwapPool';
import { BigNumber } from 'ethers';

chai.use(solidity);

describe('Pool dance integration', () => {
    let pool: CrocSwapPool
    let poolFee: CrocSwapPool
    let test: TestPool
    let testSwap: TestPool
    let testFee: TestPool
    let testFeeSwap: TestPool
    let baseToken: MockERC20
    let quoteToken: MockERC20
    const feeRate = 500 * 100
    const initBalance = BigNumber.from(100000000)

    beforeEach("deploy",  async () => {
       let factory = await ethers.getContractFactory("MockERC20")
       baseToken = await factory.deploy() as MockERC20
       quoteToken = await factory.deploy() as MockERC20

       let baseAddr = baseToken.address
       let quoteAddr = quoteToken.address
       
       factory = await ethers.getContractFactory("MockFactory")
       const poolFactory = await factory.deploy() as MockFactory

       await poolFactory.createPool(quoteAddr, baseAddr, 0)
       let poolAddr = await poolFactory.getPool(quoteAddr, baseAddr, 0)
       factory = await ethers.getContractFactory("TestPool")
       test = await factory.deploy(poolAddr, quoteAddr, baseAddr) as TestPool
       testSwap = await factory.deploy(poolAddr, quoteAddr, baseAddr) as TestPool
       factory = await ethers.getContractFactory("CrocSwapPool")
       pool = await factory.attach(poolAddr) as CrocSwapPool

       await poolFactory.createPool(quoteAddr, baseAddr, feeRate)
       poolAddr = await poolFactory.getPool(quoteAddr, baseAddr, feeRate)
       factory = await ethers.getContractFactory("TestPool")
       testFee = await factory.deploy(poolAddr, quoteAddr, baseAddr) as TestPool
       testFeeSwap = await factory.deploy(poolAddr, quoteAddr, baseAddr) as TestPool
       factory = await ethers.getContractFactory("CrocSwapPool")
       poolFee = await factory.attach(poolAddr) as CrocSwapPool

       await baseToken.deposit(test.address, 100000000);
       await quoteToken.deposit(test.address, 100000000); 
       await baseToken.deposit(testSwap.address, 100000000);
       await quoteToken.deposit(testSwap.address, 100000000); 
       await baseToken.deposit(testFee.address, 100000000);
       await quoteToken.deposit(testFee.address, 100000000); 
       await baseToken.deposit(testFeeSwap.address, 100000000);
       await quoteToken.deposit(testFeeSwap.address, 100000000); 
    })

    async function mintInit (test: TestPool, pool: CrocSwapPool): Promise<{ quote: number, base: number}> {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 
        const quoteFlow = 6744
        const baseFlow = 19094

        expect(initBalance.sub(await quoteToken.balanceOf(test.address))).to.equal(quoteFlow)
        expect(initBalance.sub(await baseToken.balanceOf(test.address))).to.equal(baseFlow)
        expect(await quoteToken.balanceOf(pool.address)).to.equal(quoteFlow)
        expect(await baseToken.balanceOf(pool.address)).to.equal(baseFlow)
        return { quote: quoteFlow, base: baseFlow }
    }


    it("add -> swap -> burn", async() => {
        let init = await mintInit(test, pool)
        const swapQuote = -484
        const swapBase = 733
        await testSwap.testSwap(false, 100000, toSqrtPrice(1.52))

        expect(initBalance.sub(await quoteToken.balanceOf(testSwap.address))).to.equal(swapQuote)
        expect(initBalance.sub(await baseToken.balanceOf(testSwap.address))).to.equal(swapBase)
        expect(await quoteToken.balanceOf(pool.address)).to.equal(init.quote + swapQuote)
        expect(await baseToken.balanceOf(pool.address)).to.equal(init.base + swapBase)

        const burnQuoteOne = init.quote - 68
        const burnBaseOne = init.base - 354
        await test.testBurn(3800, 4300, 15000)
        expect(initBalance.sub(await quoteToken.balanceOf(test.address))).to.equal(burnQuoteOne)
        expect(initBalance.sub(await baseToken.balanceOf(test.address))).to.equal(burnBaseOne)

        const burnQuoteTwo = burnQuoteOne - 1407
        const burnBaseTwo = burnBaseOne - 4540
        await test.testBurn(-5000, 8000, 10000)
        expect(initBalance.sub(await quoteToken.balanceOf(test.address))).to.equal(burnQuoteTwo)
        expect(initBalance.sub(await baseToken.balanceOf(test.address))).to.equal(burnBaseTwo)
        expect(await quoteToken.balanceOf(pool.address)).to.equal(burnQuoteTwo + swapQuote)
        expect(await baseToken.balanceOf(pool.address)).to.equal(burnBaseTwo + swapBase)

        expect(await pool.liquidity()).to.equal(65000)
        let price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.519999)
        expect(price).to.lte(1.52)
    })


    it("add -> sweep -> burn", async() => {
        let init = await mintInit(test, pool)
        const swapQuote = -5269
        const swapBase = 8964
        await testSwap.testSwap(false, 100000, toSqrtPrice(2.0))

        expect(initBalance.sub(await quoteToken.balanceOf(testSwap.address))).to.equal(swapQuote)
        expect(initBalance.sub(await baseToken.balanceOf(testSwap.address))).to.equal(swapBase)
        expect(await quoteToken.balanceOf(pool.address)).to.equal(init.quote + swapQuote)
        expect(await baseToken.balanceOf(pool.address)).to.equal(init.base + swapBase)

        const burnQuoteOne = init.quote - 0
        const burnBaseOne = init.base - 459
        await test.testBurn(3800, 4300, 15000)
        expect(initBalance.sub(await quoteToken.balanceOf(test.address))).to.equal(burnQuoteOne)
        expect(initBalance.sub(await baseToken.balanceOf(test.address))).to.equal(burnBaseOne)

        const burnQuoteTwo = burnQuoteOne - 367
        const burnBaseTwo = burnBaseOne - 6354
        await test.testBurn(-5000, 8000, 10000)
        expect(initBalance.sub(await quoteToken.balanceOf(test.address))).to.equal(burnQuoteTwo)
        expect(initBalance.sub(await baseToken.balanceOf(test.address))).to.equal(burnBaseTwo)
        expect(await quoteToken.balanceOf(pool.address)).to.equal(burnQuoteTwo + swapQuote)
        expect(await baseToken.balanceOf(pool.address)).to.equal(burnBaseTwo + swapBase)

        expect(await pool.liquidity()).to.equal(30000)
        let price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.999999)
        expect(price).to.lte(2.000000)
    })


    it("add -> swap/fee -> burn", async() => {
        let init = await mintInit(testFee, poolFee)
        const swapQuote = -5154
        const swapBase = 9197
        await testFeeSwap.testSwap(false, 100000, toSqrtPrice(2.0))

        expect(initBalance.sub(await quoteToken.balanceOf(testFeeSwap.address))).to.equal(swapQuote)
        expect(initBalance.sub(await baseToken.balanceOf(testFeeSwap.address))).to.equal(swapBase)
        expect(await quoteToken.balanceOf(poolFee.address)).to.equal(init.quote + swapQuote)
        expect(await baseToken.balanceOf(poolFee.address)).to.equal(init.base + swapBase)

        const burnQuoteOne = init.quote - 2
        const burnBaseOne = init.base - 459 - 5
        await testFee.testBurn(3800, 4300, 15000)
        expect(initBalance.sub(await quoteToken.balanceOf(testFee.address))).to.equal(burnQuoteOne)
        expect(initBalance.sub(await baseToken.balanceOf(testFee.address))).to.equal(burnBaseOne)

        const burnQuoteTwo = burnQuoteOne - 367 - 24
        const burnBaseTwo = burnBaseOne - 6354 - 48
        await testFee.testBurn(-5000, 8000, 10000)
        expect(initBalance.sub(await quoteToken.balanceOf(testFee.address))).to.equal(burnQuoteTwo)
        expect(initBalance.sub(await baseToken.balanceOf(testFee.address))).to.equal(burnBaseTwo)
        expect(await quoteToken.balanceOf(poolFee.address)).to.equal(burnQuoteTwo + swapQuote)
        expect(await baseToken.balanceOf(poolFee.address)).to.equal(burnBaseTwo + swapBase)

        expect(await poolFee.liquidity()).to.equal(30000 + 122)
        let price = fromSqrtPrice((await poolFee.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.999999)
        expect(price).to.lte(2.000000)
    })

    it("swap -> swap -> burn", async() => {
        let init = await mintInit(test, pool)

        let swapQuote = -5269
        let swapBase = 8964
        await testSwap.testSwap(false, 100000, toSqrtPrice(2.0))
        expect(initBalance.sub(await quoteToken.balanceOf(testSwap.address))).to.equal(swapQuote)
        expect(initBalance.sub(await baseToken.balanceOf(testSwap.address))).to.equal(swapBase)
        expect(await quoteToken.balanceOf(pool.address)).to.equal(init.quote + swapQuote)
        expect(await baseToken.balanceOf(pool.address)).to.equal(init.base + swapBase)

        let swapQuoteTwo = swapQuote + 7277
        let swapBaseTwo = swapBase - 11861
        await testSwap.testSwap(true, 100000, toSqrtPrice(1.4))
        expect(initBalance.sub(await quoteToken.balanceOf(testSwap.address))).to.equal(swapQuoteTwo)
        expect(initBalance.sub(await baseToken.balanceOf(testSwap.address))).to.equal(swapBaseTwo)
        expect(await quoteToken.balanceOf(pool.address)).to.equal(init.quote + swapQuoteTwo)
        expect(await baseToken.balanceOf(pool.address)).to.equal(init.base + swapBaseTwo)

        const burnQuote = init.quote - 306
        const burnBase = init.base - 0
        await test.testBurn(3800, 4300, 15000)
        expect(initBalance.sub(await quoteToken.balanceOf(test.address))).to.equal(burnQuote)
        expect(initBalance.sub(await baseToken.balanceOf(test.address))).to.equal(burnBase)

        expect(await pool.liquidity()).to.equal(40000)
        let price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.399999)
        expect(price).to.lte(1.400001) 
    })

    it("swap/fee -> swap/fee -> burn", async() => {
        let init = await mintInit(testFee, poolFee)

        let swapQuote = -5154
        let swapBase = 9197
        await testFeeSwap.testSwap(false, 100000, toSqrtPrice(2.0))
        expect(initBalance.sub(await quoteToken.balanceOf(testFeeSwap.address))).to.equal(swapQuote)
        expect(initBalance.sub(await baseToken.balanceOf(testFeeSwap.address))).to.equal(swapBase)
        expect(await quoteToken.balanceOf(poolFee.address)).to.equal(init.quote + swapQuote)
        expect(await baseToken.balanceOf(poolFee.address)).to.equal(init.base + swapBase)

        let swapQuoteTwo = swapQuote + 7487
        let swapBaseTwo = swapBase - 11629
        await testFeeSwap.testSwap(true, 100000, toSqrtPrice(1.4))
        expect(initBalance.sub(await quoteToken.balanceOf(testFeeSwap.address))).to.equal(swapQuoteTwo)
        expect(initBalance.sub(await baseToken.balanceOf(testFeeSwap.address))).to.equal(swapBaseTwo)
        expect(await quoteToken.balanceOf(poolFee.address)).to.equal(init.quote + swapQuoteTwo)
        expect(await baseToken.balanceOf(poolFee.address)).to.equal(init.base + swapBaseTwo)

        const burnQuote = init.quote - 316
        const burnBase = init.base - 15
        await testFee.testBurn(3800, 4300, 15000)
        expect(initBalance.sub(await quoteToken.balanceOf(testFee.address))).to.equal(burnQuote)
        expect(initBalance.sub(await baseToken.balanceOf(testFee.address))).to.equal(burnBase)

        expect(await poolFee.liquidity()).to.equal(40000 + 366)
        let price = fromSqrtPrice((await poolFee.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.399999)
        expect(price).to.lte(1.400001)      
    })

    it("swap -> burn -> swap", async() => {
        let init = await mintInit(test, pool)

        let swapQuote = -5269
        let swapBase = 8964
        await testSwap.testSwap(false, 100000, toSqrtPrice(2.0))
        expect(initBalance.sub(await quoteToken.balanceOf(testSwap.address))).to.equal(swapQuote)
        expect(initBalance.sub(await baseToken.balanceOf(testSwap.address))).to.equal(swapBase)
        await test.testBurn(-5000, 8000, 30000)

        let swapQuoteTwo = swapQuote + 3137
        let swapBaseTwo = swapBase - 4935
        await testSwap.testSwap(true, 100000, toSqrtPrice(1.4))
        expect(initBalance.sub(await quoteToken.balanceOf(testSwap.address))).to.equal(swapQuoteTwo)
        expect(initBalance.sub(await baseToken.balanceOf(testSwap.address))).to.equal(swapBaseTwo)

        expect(await pool.liquidity()).to.equal(10000)
        let price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.399999)
        expect(price).to.lte(1.400001) 
    })

    it("swap/fee -> burn -> swap/fee", async() => {
        let init = await mintInit(testFee, poolFee)

        let swapQuote = -5154
        let swapBase = 9197
        await testFeeSwap.testSwap(false, 100000, toSqrtPrice(2.0))
        expect(initBalance.sub(await quoteToken.balanceOf(testFeeSwap.address))).to.equal(swapQuote)
        expect(initBalance.sub(await baseToken.balanceOf(testFeeSwap.address))).to.equal(swapBase)
        await testFee.testBurn(-5000, 8000, 30000)

        let swapQuoteTwo = swapQuote + 3223
        let swapBaseTwo = swapBase - 4834
        await testFeeSwap.testSwap(true, 100000, toSqrtPrice(1.4))
        expect(initBalance.sub(await quoteToken.balanceOf(testFeeSwap.address))).to.equal(swapQuoteTwo)
        expect(initBalance.sub(await baseToken.balanceOf(testFeeSwap.address))).to.equal(swapBaseTwo)

        expect(await poolFee.liquidity()).to.equal(10000 + 147)
        let price = fromSqrtPrice((await poolFee.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.399999)
        expect(price).to.lte(1.400001) 
    })
})
