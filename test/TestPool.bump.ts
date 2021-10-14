import { TestPool } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';

chai.use(solidity);

/* Test behavior around tick bump boundary conditions. */

/*describe('Pool Bump', () => {
    let test: TestPool
    let baseToken: MockERC20
    let quoteToken: MockERC20
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = new TestPool()
       await test.fundTokens()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
    })


    // This test exists to test for a very specific type of behavior. If we swap to hit a
    // limit barrier we want to make sure that we don't knock in the next liquidity bump. 
/*    it("swap knock in liquidity at limit", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 400); 
        await test.testMint(3800, 4300, 300); 

        // 1.525 is just below the 4300th tick... Important to avoid stopping at an empty
        // spill tick, otherwise the behavior isn't tested.
        await test.testSwap(false, 100000, toSqrtPrice(1.525))
        expect(await pool.liquidity()).to.equal(700*1024 + 64)

        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.525))

        // 1.4623 is just above the 3800th tick...
        await test.testSwap(true, 100000, toSqrtPrice(1.4623))
        expect(await pool.liquidity()).to.equal(700*1024 + 230)

        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.4623))
    })

    // Tests that liquidity is kicked in and out at the correct tick bump barriers. 
    it("swap bump barrier", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 40); 
        await test.testMint(3800, 4300, 30); 
        await test.testMint(4300, 9000, 130); 
        await test.testMint(2500, 3800, 15); 

        // Exactly half a tick below 4300-- upper bump should not kick in
        await test.testSwap(false, 100000, toSqrtPrice(1.537148))
        expect(await pool.liquidity()).to.equal(71680 + 7)

        // Revert back
        await test.testSwap(true, 100000, toSqrtPrice(1.5))
        expect(await pool.liquidity()).to.equal(70*1024 + 15)
        
        // Exactly half a tick above 4300-- upper bump should kick in
        await test.testSwap(false, 100000, toSqrtPrice(1.537301))
        expect(await pool.liquidity()).to.equal(170*1024 + 22)

        // Revert back
        await test.testSwap(true, 100000, toSqrtPrice(1.5))
        expect(await pool.liquidity()).to.equal(70*1024 + 30)
        
        // Exactly half a tick below 3800-- lower bump should kick in 
        await test.testSwap(true, 100000, toSqrtPrice(1.462184))
        expect(await pool.liquidity()).to.equal(55*1024 + 38)

        // Revert back
        await test.testSwap(false, 100000, toSqrtPrice(1.5))
        expect(await pool.liquidity()).to.equal(70*1024 + 45)
                
        // Exactly half a tick above 3800-- lower bump should not kick in 
        await test.testSwap(true, 100000, toSqrtPrice(1.46233))
        expect(await pool.liquidity()).to.equal(70*1024 + 53)

        // Move one tick up through a bump
        await test.testSwap(false, 100000, toSqrtPrice(1.462184))
        expect(await pool.liquidity()).to.equal(70*1024 + 53)        

        // Move one tick down through a bumo
        await test.testSwap(true, 100000, toSqrtPrice(1.46233))
        expect(await pool.liquidity()).to.equal(70*1024 + 53)
    })

    it("mint at bump barrier", async() => {
        // 1.0 starts exact on the barrier for Tick=0
        await pool.initialize(toSqrtPrice(1.0))        
        await test.testMint(-5000, 8000, 40); 
        
        await test.testMint(0, 1000, 30); 
        expect(await test.snapQuoteOwed()).to.equal(1502)
        expect(await test.snapQuoteMint()).to.equal(1502)
        expect(await test.snapBaseOwed()).to.equal(0 + 4) // In Range, so rounds up
        expect(await test.snapBaseMint()).to.equal(0 + 4)
        expect(await pool.liquidity()).to.equal(71680)
        expect((await pool.slot0()).sqrtPriceX96).to.equal(toSqrtPrice(1.0))

        await test.testMint(-1000, 0, 30); 
        expect(await test.snapQuoteOwed()).to.equal(0)
        expect(await test.snapQuoteMint()).to.equal(0)
        expect(await test.snapBaseOwed()).to.equal(1502)
        expect(await test.snapBaseMint()).to.equal(1502)
        expect(await pool.liquidity()).to.equal(71680)
        expect((await pool.slot0()).sqrtPriceX96).to.equal(toSqrtPrice(1.0))
        
        await test.testMint(-1000, -1, 30); 
        expect(await test.snapQuoteOwed()).to.equal(0)
        expect(await test.snapQuoteMint()).to.equal(0)
        expect(await test.snapBaseOwed()).to.equal(1500)
        expect(await test.snapBaseMint()).to.equal(1500)
        expect(await pool.liquidity()).to.equal(71680)
        expect((await pool.slot0()).sqrtPriceX96).to.equal(toSqrtPrice(1.0))

        await test.testMint(1, 1000, 30); 
        expect(await test.snapQuoteOwed()).to.equal(1500)
        expect(await test.snapQuoteMint()).to.equal(1500)
        expect(await test.snapBaseOwed()).to.equal(0)
        expect(await test.snapBaseMint()).to.equal(0)
        expect(await pool.liquidity()).to.equal(71680)
        expect((await pool.slot0()).sqrtPriceX96).to.equal(toSqrtPrice(1.0))
    })

    it("swap at bitmap bottom cross", async() => {
        // 1.0 starts exact on the barrier for Tick=0
        const peg = toSqrtPrice(1.0)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40);         
        await test.testMint(0, 1000, 30); 
        await test.testMint(-1000, 0, 25); 
        expect(await pool.liquidity()).to.equal(71680)

        // Trade down from an initialized point on the barrier
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65*1024)

        // Trade down after getting back to the barrier from below
        await test.testSwap(false, 100000000, peg)
        expect(await pool.liquidity()).to.equal(71680)
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65*1024)

        // Trade down after getting back to the barrier from above
        await test.testSwap(false, 100000000, toSqrtPrice(1.5))
        await test.testSwap(true, 100000000, peg)
        expect(await pool.liquidity()).to.equal(70*1024 + 201)
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65*1024 + 201)

        // Trade down multiple ticks from the barrier
        await test.testSwap(false, 100000000, toSqrtPrice(1.5))
        await test.testSwap(true, 100000000, peg)
        expect(await pool.liquidity()).to.equal(70*1024 + 404)
        await test.testSwap(true, 100000000, toSqrtPrice(0.8))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.8))
        expect(await pool.liquidity()).to.equal(40*1024 + 464)
    })

    it("swap at bitmap bottom retreat", async() => {
        // 1.0 starts exact on the barrier for Tick=0
        const peg = toSqrtPrice(1.0)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40);         
        await test.testMint(0, 1000, 30); 
        await test.testMint(-1000, 0, 25); 

       // Trade up from an initialized point on the barrier
       await test.testSwap(false, 100000000, toSqrtPrice(1.00005))
       let price = (await pool.slot0()).sqrtPriceX96
       expect(price).to.equal(toSqrtPrice(1.00005))
       expect(await pool.liquidity()).to.equal(71680)

       // Trade up after getting back to the barrier from below
       await test.testSwap(true, 100000000, peg)
       expect(await pool.liquidity()).to.equal(71680)
       await test.testSwap(false, 100000000, toSqrtPrice(1.00005))
       price = (await pool.slot0()).sqrtPriceX96
       expect(price).to.equal(toSqrtPrice(1.00005))
       expect(await pool.liquidity()).to.equal(71680)

       // Trade up after getting back to the barrier from far below
       await test.testSwap(true, 100000000, toSqrtPrice(0.5))
       await test.testSwap(false, 100000000, peg)
       expect(await pool.liquidity()).to.equal(71680 + 233)
       await test.testSwap(false, 100000000, toSqrtPrice(1.00005))
       price = (await pool.slot0()).sqrtPriceX96
       expect(price).to.equal(toSqrtPrice(1.00005))
       expect(await pool.liquidity()).to.equal(71680 + 233)

       // Trade up multiple ticks from the barrier
       await test.testSwap(true, 100000000, toSqrtPrice(1.5))
       await test.testSwap(false, 100000000, peg)
       expect(await pool.liquidity()).to.equal(70*1024 + 233)
       await test.testSwap(false, 100000000, toSqrtPrice(1.2))
       price = (await pool.slot0()).sqrtPriceX96
       expect(price).to.equal(toSqrtPrice(1.2))
       expect(await pool.liquidity()).to.equal(40*1024 + 287)
    })

    it("swap at bitmap top retreat", async() => {
        // Starts exact on the upper barrier for Tick=-1
        const peg = toSqrtPrice(1.0).sub(1)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40);         
        await test.testMint(0, 1000, 30); 
        await test.testMint(-1000, 0, 25); 
        expect(await pool.liquidity()).to.equal(65*1024)

        // Trade down from an initialized point on the barrier
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65*1024)

        // Trade down after getting back to the barrier from below
        await test.testSwap(false, 100000000, peg)
        expect(await pool.liquidity()).to.equal(65*1024)
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65*1024)

        // Trade down after getting back to the barrier from above
        await test.testSwap(false, 100000000, toSqrtPrice(1.2))
        await test.testSwap(true, 100000000, peg)
        expect(await pool.liquidity()).to.equal(65*1024 + 108)
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65*1024 + 108)

        // Trade down multiple ticks from the barrier
        await test.testSwap(false, 100000000, toSqrtPrice(1.2))
        await test.testSwap(true, 100000000, peg)
        expect(await pool.liquidity()).to.equal(65*1024 + 216)
        await test.testSwap(true, 100000000, toSqrtPrice(0.5))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.5))
        expect(await pool.liquidity()).to.equal(333)
    })

    it("swap at bitmap top cross", async() => {
        // Starts exact on the upper barrier for Tick=-1
        const peg = toSqrtPrice(1.0).sub(1)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40);         
        await test.testMint(0, 1000, 30); 
        await test.testMint(-1000, 0, 25); 

        // Trade up from an initialized point on the barrier
        await test.testSwap(false, 100000000, toSqrtPrice(1.00005))
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00005))
        expect(await pool.liquidity()).to.equal(70*1024)

        // Trade up after getting back to the barrier from below
        await test.testSwap(true, 100000000, peg)
        expect(await pool.liquidity()).to.equal(65*1024)
        await test.testSwap(false, 100000000, toSqrtPrice(1.00005))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00005))
        expect(await pool.liquidity()).to.equal(70*1024)

        // Trade up after getting back to the barrier from above
        await test.testSwap(true, 100000000, toSqrtPrice(0.5))
        await test.testSwap(false, 100000000, peg)
        expect(await pool.liquidity()).to.equal(65*1024 + 233)
        await test.testSwap(false, 100000000, toSqrtPrice(1.00005))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00005))
        expect(await pool.liquidity()).to.equal(70*1024 + 233)

        // Trade up multiple ticks from the barrier
        await test.testSwap(true, 100000000, toSqrtPrice(0.95))
        await test.testSwap(false, 100000000, peg)
        expect(await pool.liquidity()).to.equal(65*1024 + 266)
        await test.testSwap(false, 100000000, toSqrtPrice(2.5))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(2.5))
        expect(await pool.liquidity()).to.equal(439)
    })

    // Tests bitmap cross behavior when the bottom is hollow (i.e. not inintialized tick in the first slot)
    it("swap bitmap hollow bottom", async() => {
        const peg = toSqrtPrice(1.0)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40);         
        await test.testMint(1, 1000, 30); 
        await test.testMint(-1000, 0, 25); 
        await test.testMint(-1000, -100, 15); 
        expect(await pool.liquidity()).to.equal(40*1024)

        // Trade through the bottom of the bigmap
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65*1024)

        // Trade far through the bottom of the bitmap
        await test.testSwap(false, 100000000, peg)
        expect(await pool.liquidity()).to.equal(40*1024)
        await test.testSwap(true, 100000000, toSqrtPrice(0.98))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.98))
        expect(await pool.liquidity()).to.equal(80*1024 + 6)

        // Trade out of the edge of the hollow bitmap
        await test.testSwap(false, 100000000, peg)
        expect(await pool.liquidity()).to.equal(40*1024 + 11)
        await test.testSwap(false, 100000000, toSqrtPrice(1.00015))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00015))
        expect(await pool.liquidity()).to.equal(70*1024 + 11)
    })

    // Used to measure broad-based non-reward liquidity. In most of these tests liquidity 
    // rewards are <1000, and liquidity positions are in the thousands. So if we just want
    // to check that liquidity is knocked in correctly, used the thousandth place.
    function roundLiq (liq: BigNumber): number {
        return Math.floor(liq.toNumber()/1024) * 1024
    }

    // Tests for a corner case where crossing a bitmap boundary can trick
    // the tick tracker into falsey thinking a level was previously initialized
    it("swap bitmap pre-init boundaries", async() => {
        const peg = toSqrtPrice(1.015)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40); 
        // Set bumps in the bitmap but not at the boundary        
        await test.testMint(-5000, -128, 15); 
        await test.testMint(128, 8000, 35);

        // Crosses non-bumped bitmap boundaries at {-256, -1, 0, 256} ticks
        await test.testSwap(true, 100000000, toSqrtPrice(0.97))
        await test.testSwap(false, 100000000, toSqrtPrice(1.03))
        
        await test.testMint(-512, -256, 75);
        await test.testMint(-256, -1, 120);
        await test.testMint(-1, 0, 55);
        await test.testMint(0, 255, 150);

        expect(roundLiq(await pool.liquidity())).to.equal(75*1024)
        await test.testSwap(true, 100000000, toSqrtPrice(1.01))
        expect(roundLiq(await pool.liquidity())).to.equal(190*1024)
        await test.testSwap(true, 100000000, toSqrtPrice(0.99))
        expect(roundLiq(await pool.liquidity())).to.equal(160*1024)
        await test.testSwap(true, 100000000, toSqrtPrice(0.97))
        expect(roundLiq(await pool.liquidity())).to.equal(130*1024)

        await test.testSwap(false, 100000000, toSqrtPrice(0.99))
        expect(roundLiq(await pool.liquidity())).to.equal(160*1024)
        await test.testSwap(false, 100000000, toSqrtPrice(1.01))
        expect(roundLiq(await pool.liquidity())).to.equal(190*1024)
        await test.testSwap(false, 100000000, toSqrtPrice(1.03))
        expect(roundLiq(await pool.liquidity())).to.equal(75*1024)
    })    

    // Tests that swaps spanning bitmap barriers are stable
    it("swap across bitmaps", async() => {
        const peg = toSqrtPrice(1.015)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40);         
        await test.testMint(100, 1000, 30); 
        await test.testMint(-1000, -100, 25); 
        expect(await pool.liquidity()).to.equal(70*1024)
    
        await test.testSwap(true, 100000000, toSqrtPrice(0.985))
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.985))
        expect(await pool.liquidity()).to.equal(65*1024 + 3)
    
        await test.testSwap(false, 100000000, toSqrtPrice(1.015))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.015))
        expect(await pool.liquidity()).to.equal(70*1024 + 6)

        // Now try with a non-hollow bottom barrier
        await test.testMint(0, 1000, 300); 
        await test.testMint(-1000, -1, 200); 
        await test.testSwap(true, 100000000, toSqrtPrice(0.985))
        expect(await pool.liquidity()).to.equal(265*1024 + 52)
        await test.testSwap(false, 100000000, toSqrtPrice(1.015))
        expect(await pool.liquidity()).to.equal(370*1024 + 97)
    })    

    // Test with tick bumps on both sides of the bitmap barrier
    it("swap bitmap bump both sides", async() => {
        const peg = toSqrtPrice(1.0)
        await pool.initialize(peg)  
        await test.testMint(-5000, 8000, 40);         
        await test.testMint(0, 2000, 100); 
        await test.testMint(1, 1000, 30); 
        await test.testMint(-1000, 0, 25); 
        await test.testMint(-1000, -1, 85); 
        await test.testMint(-1000, -128, 90); 

        await test.testSwap(false, 100000000, toSqrtPrice(1.1))
        await test.testSwap(true, 100000000, toSqrtPrice(0.99995))
        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65*1024 + 179)

        await test.testSwap(false, 100000000, toSqrtPrice(1.1))
        await test.testSwap(true, 100000000, toSqrtPrice(0.99985))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99985))
        expect(await pool.liquidity()).to.equal(150*1024 + 357)

        await test.testSwap(false, 100000000, toSqrtPrice(1.1))
        await test.testSwap(true, 100000000, toSqrtPrice(0.97))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.97))
        expect(await pool.liquidity()).to.equal(240*1024 + 568)

        await test.testSwap(false, 100000000, toSqrtPrice(1.1))
        await test.testSwap(true, 100000000, toSqrtPrice(1.0))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.0))
        expect(await pool.liquidity()).to.equal(140*1024 + 778)

        await test.testSwap(false, 100000000, toSqrtPrice(1.1))
        await test.testSwap(true, 100000000, toSqrtPrice(1.00005))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00005))
        expect(await pool.liquidity()).to.equal(140*1024 + 958)

        await test.testSwap(true, 100000000, toSqrtPrice(0.9))
        await test.testSwap(false, 100000000, toSqrtPrice(1.00005))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00005))
        expect(await pool.liquidity()).to.equal(140*1024 + 1210)

        await test.testSwap(true, 100000000, toSqrtPrice(0.9))
        await test.testSwap(false, 100000000, toSqrtPrice(1.00015))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00015))
        expect(await pool.liquidity()).to.equal(170*1024 + 1464)

        await test.testSwap(true, 100000000, toSqrtPrice(0.9))
        await test.testSwap(false, 100000000, toSqrtPrice(1.15))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.15))
        expect(await pool.liquidity()).to.equal(140*1024 + 1843)

        await test.testSwap(true, 100000000, toSqrtPrice(0.9))
        await test.testSwap(false, 100000000, toSqrtPrice(1.00025))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.00025))
        expect(await pool.liquidity()).to.equal(170*1024 + 2222)

        await test.testSwap(true, 100000000, toSqrtPrice(0.9))
        await test.testSwap(false, 100000000, toSqrtPrice(1.0))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(1.0))
        expect(await pool.liquidity()).to.equal(140*1024 + 2477)

        await test.testSwap(true, 100000000, toSqrtPrice(0.9))
        await test.testSwap(false, 100000000, toSqrtPrice(0.99995))
        price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.equal(toSqrtPrice(0.99995))
        expect(await pool.liquidity()).to.equal(65*1024 + 2731)
    })
})*/
