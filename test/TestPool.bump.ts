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

/* Test behavior around tick bump boundary conditions. */
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
       
       await baseToken.deposit(test.address, 1000000000);
       await quoteToken.deposit(test.address, 1000000000); 
       await baseToken.deposit(testZero.address, 1000000000);
       await quoteToken.deposit(testZero.address, 1000000000); 
    })

    // This test exists to test for a very specific type of behavior. If we swap to hit a
    // limit barrier we want to make sure that we don't knock in the next liquidity bump. */
    it("swap knock in liquidity at limit", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 

        // 1.525 is just below the 4300th tick... Important to avoid stopping at an empty
        // spill tick, otherwise the behavior isn't tested.
        await test.testSwap(false, 100000, toSqrtPrice(1.525))
        expect(await pool.liquidity()).to.equal(70000 + 3)

        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.525))

        // 1.4623 is just above the 3800th tick...
        await test.testSwap(true, 100000, toSqrtPrice(1.4623))
        expect(await pool.liquidity()).to.equal(70000 + 16)

        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.4623))
    })

    // Tests that liquidity is kicked in and out at the correct tick bump barriers. */
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
        expect(await pool.liquidity()).to.equal(70000 + 27)
        
        // Exactly half a tick below 3800-- lower bump should kick in 
        await test.testSwap(true, 100000, toSqrtPrice(1.462184))
        expect(await pool.liquidity()).to.equal(55000 + 34)

        // Revert back
        await test.testSwap(false, 100000, toSqrtPrice(1.5))
        expect(await pool.liquidity()).to.equal(70000 + 41)
                
        // Exactly half a tick above 3800-- lower bump should not kick in 
        await test.testSwap(true, 100000, toSqrtPrice(1.46233))
        expect(await pool.liquidity()).to.equal(70000 + 48)

        // Move one tick up through a bump
        await test.testSwap(false, 100000, toSqrtPrice(1.462184))
        expect(await pool.liquidity()).to.equal(70000 + 48)        

        // Move one tick down through a bumo
        await test.testSwap(true, 100000, toSqrtPrice(1.46233))
        expect(await pool.liquidity()).to.equal(70000 + 48)
    })

    it("mint at bump barrier", async() => {
        // 1.0 starts exact on the barrier for Tick=0
        await pool.initialize(toSqrtPrice(1.0))        
        await test.testMint(-5000, 8000, 40000); 
        
        await test.testMint(0, 1000, 30000); 
        expect(await test.snapQuoteOwed()).to.equal(1467)
        expect(await test.snapQuoteMint()).to.equal(1467)
        expect(await test.snapBaseOwed()).to.equal(0)
        expect(await test.snapBaseMint()).to.equal(0)
        expect(await pool.liquidity()).to.equal(70000)
        expect((await pool.slot0()).sqrtPriceX96).to.equal(toSqrtPrice(1.0))

        await test.testMint(-1000, 0, 30000); 
        expect(await test.snapQuoteOwed()).to.equal(0)
        expect(await test.snapQuoteMint()).to.equal(0)
        expect(await test.snapBaseOwed()).to.equal(1467)
        expect(await test.snapBaseMint()).to.equal(1467)
        expect(await pool.liquidity()).to.equal(70000)
        expect((await pool.slot0()).sqrtPriceX96).to.equal(toSqrtPrice(1.0))
        
        await test.testMint(-1000, -1, 30000); 
        expect(await test.snapQuoteOwed()).to.equal(0)
        expect(await test.snapQuoteMint()).to.equal(0)
        expect(await test.snapBaseOwed()).to.equal(1465)
        expect(await test.snapBaseMint()).to.equal(1465)
        expect(await pool.liquidity()).to.equal(70000)
        expect((await pool.slot0()).sqrtPriceX96).to.equal(toSqrtPrice(1.0))

        await test.testMint(1, 1000, 30000); 
        expect(await test.snapQuoteOwed()).to.equal(1465)
        expect(await test.snapQuoteMint()).to.equal(1465)
        expect(await test.snapBaseOwed()).to.equal(0)
        expect(await test.snapBaseMint()).to.equal(0)
        expect(await pool.liquidity()).to.equal(70000)
        expect((await pool.slot0()).sqrtPriceX96).to.equal(toSqrtPrice(1.0))
    })

    it("swap at bitmap bottom cross", async() => {
        // 1.0 starts exact on the barrier for Tick=0
        const peg = toSqrtPrice(1.0)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40000);         
        await test.testMint(0, 1000, 30000); 
        await test.testMint(-1000, 0, 25000); 
        expect(await pool.liquidity()).to.equal(70000)

        // Trade down from an initialized point on the barrier
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65000)

        // Trade down after getting back to the barrier from below
        await test.testSwap(false, 100000000, peg)
        expect(await pool.liquidity()).to.equal(70000)
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65000)

        // Trade down after getting back to the barrier from above
        await test.testSwap(false, 100000000, toSqrtPrice(1.5))
        await test.testSwap(true, 100000000, peg)
        expect(await pool.liquidity()).to.equal(70000 + 187)
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65000 + 187)

        // Trade down multiple ticks from the barrier
        await test.testSwap(false, 100000000, toSqrtPrice(1.5))
        await test.testSwap(true, 100000000, peg)
        expect(await pool.liquidity()).to.equal(70000 + 376)
        await test.testSwap(true, 100000000, toSqrtPrice(0.8))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.8))
        expect(await pool.liquidity()).to.equal(40000 + 426)
    })

    it("swap at bitmap bottom retreat", async() => {
        // 1.0 starts exact on the barrier for Tick=0
        const peg = toSqrtPrice(1.0)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40000);         
        await test.testMint(0, 1000, 30000); 
        await test.testMint(-1000, 0, 25000); 

       // Trade up from an initialized point on the barrier
       await test.testSwap(false, 100000000, toSqrtPrice(1.00005))
       let price = (await pool.slot0()).sqrtPriceX96
       expect(price).to.equal(toSqrtPrice(1.00005))
       expect(await pool.liquidity()).to.equal(70000)

       // Trade up after getting back to the barrier from below
       await test.testSwap(true, 100000000, peg)
       expect(await pool.liquidity()).to.equal(70000)
       await test.testSwap(false, 100000000, toSqrtPrice(1.00005))
       price = (await pool.slot0()).sqrtPriceX96
       expect(price).to.equal(toSqrtPrice(1.00005))
       expect(await pool.liquidity()).to.equal(70000)

       // Trade up after getting back to the barrier from far below
       await test.testSwap(true, 100000000, toSqrtPrice(0.5))
       await test.testSwap(false, 100000000, peg)
       expect(await pool.liquidity()).to.equal(70000+ 208)
       await test.testSwap(false, 100000000, toSqrtPrice(1.00005))
       price = (await pool.slot0()).sqrtPriceX96
       expect(price).to.equal(toSqrtPrice(1.00005))
       expect(await pool.liquidity()).to.equal(70000 + 208)

       // Trade up multiple ticks from the barrier
       await test.testSwap(true, 100000000, toSqrtPrice(1.5))
       await test.testSwap(false, 100000000, peg)
       expect(await pool.liquidity()).to.equal(70000 + 208)
       await test.testSwap(false, 100000000, toSqrtPrice(1.2))
       price = (await pool.slot0()).sqrtPriceX96
       expect(price).to.equal(toSqrtPrice(1.2))
       expect(await pool.liquidity()).to.equal(40000 + 260)
    })

    it("swap at bitmap top retreat", async() => {
        // Starts exact on the upper barrier for Tick=-1
        const peg = toSqrtPrice(1.0).sub(1)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40000);         
        await test.testMint(0, 1000, 30000); 
        await test.testMint(-1000, 0, 25000); 
        expect(await pool.liquidity()).to.equal(65000)

        // Trade down from an initialized point on the barrier
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65000)

        // Trade down after getting back to the barrier from below
        await test.testSwap(false, 100000000, peg)
        expect(await pool.liquidity()).to.equal(65000)
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65000)

        // Trade down after getting back to the barrier from above
        await test.testSwap(false, 100000000, toSqrtPrice(1.2))
        await test.testSwap(true, 100000000, peg)
        expect(await pool.liquidity()).to.equal(65102)
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65102)

        // Trade down multiple ticks from the barrier
        await test.testSwap(false, 100000000, toSqrtPrice(1.2))
        await test.testSwap(true, 100000000, peg)
        expect(await pool.liquidity()).to.equal(65000 + 203)
        await test.testSwap(true, 100000000, toSqrtPrice(0.5))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.5))
        expect(await pool.liquidity()).to.equal(298)
    })

    it("swap at bitmap top cross", async() => {
        // Starts exact on the upper barrier for Tick=-1
        const peg = toSqrtPrice(1.0).sub(1)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40000);         
        await test.testMint(0, 1000, 30000); 
        await test.testMint(-1000, 0, 25000); 

        // Trade up from an initialized point on the barrier
        await test.testSwap(false, 100000000, toSqrtPrice(1.00005))
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00005))
        expect(await pool.liquidity()).to.equal(70000)

        // Trade up after getting back to the barrier from below
        await test.testSwap(true, 100000000, peg)
        expect(await pool.liquidity()).to.equal(65000)
        await test.testSwap(false, 100000000, toSqrtPrice(1.00005))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00005))
        expect(await pool.liquidity()).to.equal(70000)

        // Trade up after getting back to the barrier from above
        await test.testSwap(true, 100000000, toSqrtPrice(0.5))
        await test.testSwap(false, 100000000, peg)
        expect(await pool.liquidity()).to.equal(65000 + 208)
        await test.testSwap(false, 100000000, toSqrtPrice(1.00005))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00005))
        expect(await pool.liquidity()).to.equal(70208)

        // Trade up multiple ticks from the barrier
        await test.testSwap(true, 100000000, toSqrtPrice(0.95))
        await test.testSwap(false, 100000000, peg)
        expect(await pool.liquidity()).to.equal(65000 + 241)
        await test.testSwap(false, 100000000, toSqrtPrice(2.5))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(2.5))
        expect(await pool.liquidity()).to.equal(408)
    })

    // Tests bitmap cross behavior when the bottom is hollow (i.e. not inintialized tick in the first slot)
    it("swap bitmap hollow bottom", async() => {
        const peg = toSqrtPrice(1.0)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40000);         
        await test.testMint(1, 1000, 30000); 
        await test.testMint(-1000, 0, 25000); 
        await test.testMint(-1000, -100, 15000); 
        expect(await pool.liquidity()).to.equal(40000)

        // Trade through the bottom of the bigmap
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65000)

        // Trade far through the bottom of the bitmap
        await test.testSwap(false, 100000000, peg)
        expect(await pool.liquidity()).to.equal(40000)
        await test.testSwap(true, 100000000, toSqrtPrice(0.98))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.98))
        expect(await pool.liquidity()).to.equal(80000 + 6)

        // Trade out of the edge of the hollow bitmap
        await test.testSwap(false, 100000000, peg)
        expect(await pool.liquidity()).to.equal(40000 + 11)
        await test.testSwap(false, 100000000, toSqrtPrice(1.00015))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00015))
        expect(await pool.liquidity()).to.equal(70000 + 11)
    })

    // Used to measure broad-based non-reward liquidity. In most of these tests liquidity 
    // rewards are <1000, and liquidity positions are in the thousands. So if we just want
    // to check that liquidity is knocked in correctly, used the thousandth place.
    function roundLiq (liq: BigNumber): number {
        return Math.floor(liq.toNumber()/1000) * 1000
    }

    // Tests for a corner case where crossing a bitmap boundary can trick
    // the tick tracker into falsey thinking a level was previously initialized
    it("swap bitmap pre-init boundaries", async() => {
        const peg = toSqrtPrice(1.015)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40000); 
        // Set bumps in the bitmap but not at the boundary        
        await test.testMint(-5000, -128, 15000); 
        await test.testMint(128, 8000, 35000);

        // Crosses non-bumped bitmap boundaries at {-256, -1, 0, 256} ticks
        await test.testSwap(true, 100000000, toSqrtPrice(0.97))
        await test.testSwap(false, 100000000, toSqrtPrice(1.03))
        
        await test.testMint(-512, -256, 75000);
        await test.testMint(-256, -1, 120000);
        await test.testMint(-1, 0, 55000);
        await test.testMint(0, 255, 150000);

        expect(roundLiq(await pool.liquidity())).to.equal(75000)
        await test.testSwap(true, 100000000, toSqrtPrice(1.01))
        expect(roundLiq(await pool.liquidity())).to.equal(190000)
        await test.testSwap(true, 100000000, toSqrtPrice(0.99))
        expect(roundLiq(await pool.liquidity())).to.equal(160000)
        await test.testSwap(true, 100000000, toSqrtPrice(0.97))
        expect(roundLiq(await pool.liquidity())).to.equal(130000)

        await test.testSwap(false, 100000000, toSqrtPrice(0.99))
        expect(roundLiq(await pool.liquidity())).to.equal(160000)
        await test.testSwap(false, 100000000, toSqrtPrice(1.01))
        expect(roundLiq(await pool.liquidity())).to.equal(190000)
        await test.testSwap(false, 100000000, toSqrtPrice(1.03))
        expect(roundLiq(await pool.liquidity())).to.equal(75000)
    })    

    // Tests that swaps spanning bitmap barriers are stable
    it("swap across bitmaps", async() => {
        const peg = toSqrtPrice(1.015)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40000);         
        await test.testMint(100, 1000, 30000); 
        await test.testMint(-1000, -100, 25000); 
        expect(await pool.liquidity()).to.equal(70000)
    
        await test.testSwap(true, 100000000, toSqrtPrice(0.985))
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.985))
        expect(await pool.liquidity()).to.equal(65000 + 3)
    
        await test.testSwap(false, 100000000, toSqrtPrice(1.015))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.015))
        expect(await pool.liquidity()).to.equal(70000 + 6)

        // Now try with a non-hollow bottom barrier
        await test.testMint(0, 1000, 300000); 
        await test.testMint(-1000, -1, 200000); 
        await test.testSwap(true, 100000000, toSqrtPrice(0.985))
        expect(await pool.liquidity()).to.equal(265000 + 52)
        await test.testSwap(false, 100000000, toSqrtPrice(1.015))
        expect(await pool.liquidity()).to.equal(370000 + 97)
    })    

    // Test with tick bumps on both sides of the bitmap barrier
    it("swap bitmap bump both sides", async() => {
        const peg = toSqrtPrice(1.0)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40000);         
        await test.testMint(0, 2000, 100000); 
        await test.testMint(1, 1000, 30000); 
        await test.testMint(-1000, 0, 25000); 
        await test.testMint(-1000, -1, 85000); 
        await test.testMint(-1000, -128, 90000); 

        await test.testSwap(false, 100000000, toSqrtPrice(1.1))
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65000 + 171)

        await test.testSwap(false, 100000000, toSqrtPrice(1.1))
        await test.testSwap(true, 100000000, toSqrtPrice(0.99985))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99985))
        expect(await pool.liquidity()).to.equal(150000 + 342)

        await test.testSwap(false, 100000000, toSqrtPrice(1.1))
        await test.testSwap(true, 100000000, toSqrtPrice(0.97))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.97))
        expect(await pool.liquidity()).to.equal(240000 + 545)

        await test.testSwap(false, 100000000, toSqrtPrice(1.1))
        await test.testSwap(true, 100000000, toSqrtPrice(1.0))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.0))
        expect(await pool.liquidity()).to.equal(140000 + 750)

        await test.testSwap(false, 100000000, toSqrtPrice(1.1))
        await test.testSwap(true, 100000000, toSqrtPrice(1.00005))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00005))
        expect(await pool.liquidity()).to.equal(140000 + 923)

        await test.testSwap(true, 100000000, toSqrtPrice(0.9))
        await test.testSwap(false, 100000000, toSqrtPrice(1.00005))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00005))
        expect(await pool.liquidity()).to.equal(140000 + 1168)

        await test.testSwap(true, 100000000, toSqrtPrice(0.9))
        await test.testSwap(false, 100000000, toSqrtPrice(1.00015))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00015))
        expect(await pool.liquidity()).to.equal(170000 + 1413)

        await test.testSwap(true, 100000000, toSqrtPrice(0.9))
        await test.testSwap(false, 100000000, toSqrtPrice(1.15))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.15))
        expect(await pool.liquidity()).to.equal(140000 + 1779)

        await test.testSwap(true, 100000000, toSqrtPrice(0.9))
        await test.testSwap(false, 100000000, toSqrtPrice(1.00025))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00025))
        expect(await pool.liquidity()).to.equal(170000 + 2146)

        await test.testSwap(true, 100000000, toSqrtPrice(0.9))
        await test.testSwap(false, 100000000, toSqrtPrice(1.0))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.0))
        expect(await pool.liquidity()).to.equal(140000 + 2393)

        await test.testSwap(true, 100000000, toSqrtPrice(0.9))
        await test.testSwap(false, 100000000, toSqrtPrice(0.99995))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65000 + 2640)
    })
})
