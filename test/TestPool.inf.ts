import { TestPool } from '../typechain/TestPool'
import { MockFactory } from '../typechain/MockFactory'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { CrocSwapPool } from '../typechain/CrocSwapPool';
import { BigNumber } from 'ethers';

chai.use(solidity);

/* Test behavior around infinite or zero pool boundaries. */
describe('Pool Ininity Bounds', () => {
    let pool: CrocSwapPool
    let poolZero: CrocSwapPool
    let test: TestPool
    let test2: TestPool
    let testZero: TestPool
    let baseToken: MockERC20
    let quoteToken: MockERC20
    let poolFactory: MockFactory
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       let factory = await ethers.getContractFactory("MockERC20")
       baseToken = await factory.deploy() as MockERC20
       quoteToken = await factory.deploy() as MockERC20

       let baseAddr = baseToken.address
       let quoteAddr = quoteToken.address
       
       factory = await ethers.getContractFactory("MockFactory")
       poolFactory = await factory.deploy() as MockFactory

       await poolFactory.createPool(quoteAddr, baseAddr, feeRate)
       let poolAddr = await poolFactory.getPool(quoteAddr, baseAddr, feeRate)
       factory = await ethers.getContractFactory("TestPool")
       test = await factory.deploy(poolAddr, quoteAddr, baseAddr) as TestPool
       test2 = await factory.deploy(poolAddr, quoteAddr, baseAddr) as TestPool

       await poolFactory.createPool(quoteAddr, baseAddr, 0)
       let poolAddrZero = await poolFactory.getPool(quoteAddr, baseAddr, feeRate)
       testZero = await factory.deploy(poolAddrZero, quoteAddr, baseAddr) as TestPool

       factory = await ethers.getContractFactory("CrocSwapPool")
       pool = await factory.attach(poolAddr) as CrocSwapPool
       poolZero = await factory.attach(poolAddrZero) as CrocSwapPool
       
       await baseToken.deposit(test.address, 1000000000);
       await quoteToken.deposit(test.address, 1000000000); 
       await baseToken.deposit(testZero.address, 1000000000);
       await quoteToken.deposit(testZero.address, 1000000000); 
    })

    it("swap infinity barrier", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        
        await test.testSwap(false, 100000000, maxSqrtPrice())
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.gte(10000000000000)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(0)

        await test.testSwap(false, 100000000, maxSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.gte(10000000000000)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(0)

        await test.testSwap(true, 100000000, minSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.lte(0.00000000000001)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(0)

        await test.testSwap(true, 100000000, minSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.lte(0.00000000000001)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(0)
    })

    it("swap infinity barrier output qty", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        
        await test.testSwap(false, -100000000, maxSqrtPrice())
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.gte(10000000000000)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(0)

        await test.testSwap(false, -100000000, maxSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.gte(10000000000000)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(0)

        await test.testSwap(true, -100000000, minSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.lte(0.00000000000001)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(0)

        await test.testSwap(true, -100000000, minSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.lte(0.00000000000001)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(0)
    })

    it("swap infinity barrier zero fee", async() => {
        await poolZero.initialize(toSqrtPrice(1.5))
        
        await testZero.testSwap(false, 100000000, maxSqrtPrice())
        let price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.equal(maxSqrtPrice())
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(0)

        await testZero.testSwap(false, 100000000, maxSqrtPrice())
        price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.equal(maxSqrtPrice())
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(0)

        await testZero.testSwap(true, 100000000, minSqrtPrice())
        price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.equal(minSqrtPrice())
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(0)

        await testZero.testSwap(true, 100000000, minSqrtPrice())
        price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.equal(minSqrtPrice())
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(0)
    })

    it("swap infinity barrier zero fee output qty", async() => {
        await poolZero.initialize(toSqrtPrice(1.5))
        
        await testZero.testSwap(false, -100000000, maxSqrtPrice())
        let price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.equal(maxSqrtPrice())
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(1)

        await testZero.testSwap(false, -100000000, maxSqrtPrice())
        price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.equal(maxSqrtPrice())
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(1)

        await testZero.testSwap(true, -100000000, minSqrtPrice())
        price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.equal(minSqrtPrice())
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(1)

        await testZero.testSwap(true, -100000000, minSqrtPrice())
        price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.equal(minSqrtPrice())
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(1)
    })

    it("swap really low liq", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-887272, 887272, 1); 

        await test.testSwap(false, 100000000, maxSqrtPrice())
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.gte(10000000000000)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(1)

        await test.testSwap(false, 100000000, maxSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.gte(10000000000000)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(1)

        await test.testSwap(true, 100000000, minSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.lte(0.00000000000001)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(1)

        await test.testSwap(true, 100000000, minSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.lte(0.00000000000001)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(1)
    })

    it("swap really low liq output qty", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-887272, 887272, 1); 

        await test.testSwap(false, -100000000, maxSqrtPrice())
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.gte(10000000000000)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(1)

        await test.testSwap(false, -100000000, maxSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.gte(10000000000000)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(1)

        await test.testSwap(true, -100000000, minSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.lte(0.00000000000001)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(1)

        await test.testSwap(true, -100000000, minSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.lte(0.00000000000001)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)
        expect(await pool.liquidity()).to.equal(1)
    })

    it("swap really low liq zero fees", async() => {
        await poolZero.initialize(toSqrtPrice(1.5))
        await testZero.testMint(-887272, 887272, 1); 

        await testZero.testSwap(false, 100000000, maxSqrtPrice())
        let price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.gte(10000000000000)
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(1)

        await testZero.testSwap(false, 100000000, maxSqrtPrice())
        price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.gte(10000000000000)
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(1)

        await testZero.testSwap(true, 100000000, minSqrtPrice())
        price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.lte(0.00000000000001)
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(1)

        await testZero.testSwap(true, 100000000, minSqrtPrice())
        price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.lte(0.00000000000001)
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(1)
    })

    it("swap really low liq output qty", async() => {
        await poolZero.initialize(toSqrtPrice(1.5))
        await testZero.testMint(-887272, 887272, 1); 

        await testZero.testSwap(false, -100000000, maxSqrtPrice())
        let price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.gte(10000000000000)
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(1)

        await testZero.testSwap(false, -100000000, maxSqrtPrice())
        price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.gte(10000000000000)
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(1)

        await testZero.testSwap(true, -100000000, minSqrtPrice())
        price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.lte(0.00000000000001)
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(1)

        await testZero.testSwap(true, -100000000, minSqrtPrice())
        price = (await poolZero.slot0()).sqrtPriceX96
        expect(price).to.lte(0.00000000000001)
        expect(await testZero.snapBaseFlow()).to.equal(0)
        expect(await testZero.snapQuoteFlow()).to.equal(0)
        expect(await poolZero.liquidity()).to.equal(1)
    })

    it("swap init max infinity", async() => {
        await pool.initialize(maxSqrtPrice())
    
        await test.testSwap(false, 100000000, toSqrtPrice(1.5))
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.5))
        expect(await pool.liquidity()).to.equal(0)
    })

    it("swap init min infinity", async() => {
        await pool.initialize(minSqrtPrice())
    
        await test.testSwap(true, 100000000, toSqrtPrice(1.5))
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.5))
        expect(await pool.liquidity()).to.equal(0)
    })

    it("swap infinity book fee", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 4000); 
        await test.testMint(3800, 4300, 3000); 
        await test.testMint(3400, 4800, 2000); 

        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        await test.testSwap(false, 10000000, maxSqrtPrice())

        let limitFlow = 10000000
        let counterFlow = -635
        let liqGrowth = 5

        expect(await test.snapBaseSwap()).to.equal(limitFlow)
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(0 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(limitFlow)

        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.gte(BigNumber.from("1000000000000000000"))
    })

    it("swap infinity zero liq", async() => {
        await pool.initialize(toSqrtPrice(1.5))

        // Set liquidity thin enough that fee vig rounds down to zero
        await test.testMint(-5000, 8000, 400); 
        await test.testMint(3800, 4300, 300); 
        await test.testMint(3400, 4800, 200); 

        // Reverts because caller won't have infinite tokens to counterflow against
        // zero liquidity.
        expect(test.testSwap(false, 10000000, maxSqrtPrice())).to.be.reverted
        expect(test.testSwap(true, 10000000, maxSqrtPrice())).to.be.reverted
    })
})
