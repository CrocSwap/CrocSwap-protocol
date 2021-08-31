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

chai.use(solidity);

/* Test correct behavior around tick bump boundary conditions. */
describe('Pool Bump', () => {
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
       
       await baseToken.deposit(test.address, 100000000);
       await quoteToken.deposit(test.address, 100000000); 
       await baseToken.deposit(testZero.address, 100000000);
       await quoteToken.deposit(testZero.address, 100000000); 
    })

    /* This test exists to test for a very specific type of behavior. If we swap to hit a
     * limit barrier we want to make sure that we don't knock in the next liquidity bump. */
    it("swap knock in liquidity at limit", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 

        // 1.525 is just below the 4300th tick... Important to avoid stopping at an empty
        // spill tick, otherwise the behavior isn't tested.
        await test.testSwap(false, 100000, toSqrtPrice(1.525))
        expect(await pool.liquidity()).to.equal(70000 + 3)

        let price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.524999)
        expect(price).to.lte(1.525)

        // 1.4623 is just above the 3800th tick...
        await test.testSwap(true, 100000, toSqrtPrice(1.4623))
        expect(await pool.liquidity()).to.equal(70000 + 7)

        price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.4623)
        expect(price).to.lte(1.4623001)
    })

    /* Tests that liquidity is kicked in and out at the correct tick bump barriers. */
    it("swap bump barrier", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(4300, 9000, 130000); 
        await test.testMint(2500, 3800, 15000); 

        // Exactly half a tick below 4300-- upper bump should not kick in
        await test.testSwap(false, 100000, toSqrtPrice(1.537148))
        expect(await pool.liquidity()).to.equal(70000 + 6)

        // Revert back
        await test.testSwap(true, 100000, toSqrtPrice(1.5))
        expect(await pool.liquidity()).to.equal(70000 + 13)
        
        // Exactly half a tick above 4300-- upper bump should kick in
        await test.testSwap(false, 100000, toSqrtPrice(1.537301))
        expect(await pool.liquidity()).to.equal(170000 + 20)

        // Revert back
        await test.testSwap(true, 100000, toSqrtPrice(1.5))
        expect(await pool.liquidity()).to.equal(70000 + 12)
        
        // Exactly half a tick below 3800-- lower bump should kick in 
        await test.testSwap(true, 100000, toSqrtPrice(1.462184))
        expect(await pool.liquidity()).to.equal(55000 + 24)

        // Revert back
        await test.testSwap(false, 100000, toSqrtPrice(1.5))
        expect(await pool.liquidity()).to.equal(70000 + 12)
                
        // Exactly half a tick above 3800-- lower bump should not kick in 
        await test.testSwap(true, 100000, toSqrtPrice(1.46233))
        expect(await pool.liquidity()).to.equal(70000 + 36)

        // Move one tick up through a bump
        await test.testSwap(false, 100000, toSqrtPrice(1.462184))
        expect(await pool.liquidity()).to.equal(70000 + 24)        

        // Move one tick down through a bumo
        await test.testSwap(true, 100000, toSqrtPrice(1.46233))
        expect(await pool.liquidity()).to.equal(70000 + 36)
    })
    
    it("swap infinity barrier", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-887272, 887272, 1); 
    
        await test.testSwap(false, 100000000, maxSqrtPrice())
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(maxSqrtPrice())
        expect(await pool.liquidity()).to.equal(1)

        await test.testSwap(false, 100000000, maxSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(maxSqrtPrice())
        expect(await pool.liquidity()).to.equal(1)

        await test.testSwap(true, 100000000, minSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(maxSqrtPrice())
        expect(await pool.liquidity()).to.equal(1)

        await test.testSwap(true, 100000000, minSqrtPrice())
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(maxSqrtPrice())
        expect(await pool.liquidity()).to.equal(1)
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
        let counterFlow = -625
        let liqGrowth = 5

        expect(await test.snapBaseSwap()).to.equal(limitFlow)
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(0 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(limitFlow)

        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.eq(maxSqrtPrice())
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
