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

chai.use(solidity);

describe('Pool', () => {
    let pool: CrocSwapPool
    let test: TestPool
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

       factory = await ethers.getContractFactory("CrocSwapPool")
       pool = await factory.attach(poolAddr) as CrocSwapPool
       
       await baseToken.deposit(test.address, 100000000);
       await quoteToken.deposit(test.address, 100000000); 
    })


    it("mint collection", async() => {
       await pool.initialize(toSqrtPrice(1.5))
       await test.testMint(-100, 100, 10000);
       expect(await test.snapQuoteOwed()).to.equal(0)
       expect(await test.snapQuoteMint()).to.equal(0)
       expect(await test.snapBaseOwed()).to.equal(100)
       expect(await test.snapBaseMint()).to.equal(100)

       await test.testMint(5000, 6000, 10000);
       expect(await test.snapQuoteOwed()).to.equal(380)
       expect(await test.snapQuoteMint()).to.equal(380)
       expect(await test.snapBaseOwed()).to.equal(0)
       expect(await test.snapBaseMint()).to.equal(0)

       await test.testMint(3000, 5000, 10000);
       expect(await test.snapQuoteOwed()).to.equal(377)
       expect(await test.snapQuoteMint()).to.equal(377)
       expect(await test.snapBaseOwed()).to.equal(630)
       expect(await test.snapBaseMint()).to.equal(630)

       expect(await baseToken.balanceOf(pool.address)).to.equal(730)
       expect(await quoteToken.balanceOf(pool.address)).to.equal(757)
    })

    it("mint liquidity", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-100, 100, 5000);
        await test.testMint(5000, 6000, 6000);
        expect(await pool.liquidity()).to.equal(0)
        expect((await pool.slot0()).sqrtPriceX96).to.equal(toSqrtPrice(1.5))
        
        await test.testMint(3000, 5000, 10000);
        await test.testMint(3500, 4500, 20000);
        expect(await pool.liquidity()).to.equal(30000)
        expect((await pool.slot0()).sqrtPriceX96).to.equal(toSqrtPrice(1.5))
    })

    it("swap simple", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        
        const swapFlow = 6612
        const feeCost = 148
        const liqBonus = 2
        const liqGrowth = 89
        const counterFlow = -(swapFlow - feeCost + liqBonus)

        await test.testSwap(false, 10000, toSqrtPrice(2.0))
        expect(await test.snapBaseSwap()).to.equal(10000)
        expect(await test.snapBaseFlow()).to.equal(10000)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(1000000 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(10000)

        let price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.524319)
        expect(price).to.lte(1.524321)
    })
    

    it("swap protocol fee", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        await poolFactory.setOwner(test.address)
        await test.testProtocolSetFee(6)

        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        await test.testSwap(false, 10000, toSqrtPrice(2.0))

        const swapFlow = 6612
        const feeCost = 148
        const liqBonus = 1
        const liqGrowth = 74
        const counterFlow = -(swapFlow - feeCost + liqBonus)

        expect(await test.snapBaseSwap()).to.equal(10000)
        expect(await test.snapBaseFlow()).to.equal(10000)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(1000000 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(10000)

        let protoFees = (await pool.protocolFees())
        expect(protoFees[0]).to.equal(24)
        expect(protoFees[1]).to.equal(0)
    })

    it("swap sell", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        
        const swapFlow = 6722
        const feeCost = 151
        const liqGrowth = 92
        const counterFlow = (swapFlow + feeCost)

        await test.testSwap(true, -10000, toSqrtPrice(1.25))
        expect(await test.snapBaseSwap()).to.equal(-10000)
        expect(await test.snapBaseFlow()).to.equal(-10000)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(1000000 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(-10000)

        let price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.47533)
        expect(price).to.lte(1.47534)
    })

    it("swap sell protocol fee", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        await poolFactory.setOwner(test.address)
        await test.testProtocolSetFee(6)
        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)

        const swapFlow = 6722
        const feeCost = 151
        const liqBonus = 1
        const liqGrowth = 77
        const counterFlow = (swapFlow + feeCost + liqBonus)

        await test.testSwap(true, -10000, toSqrtPrice(1.25))
        expect(await test.snapBaseSwap()).to.equal(-10000)
        expect(await test.snapBaseFlow()).to.equal(-10000)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(1000000 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(-10000)

        let protoFees = (await pool.protocolFees())
        expect(protoFees[0]).to.equal(25)
        expect(protoFees[1]).to.equal(0)
    })

    it("swap wrong direction", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        
        await test.testSwap(true, -10000, toSqrtPrice(1.55))
        expect(await test.snapBaseSwap()).to.equal(0)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteSwap()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)

        expect(await pool.liquidity()).to.equal(1000000)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(0)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(0)

        await test.testSwap(false, 5000, toSqrtPrice(1.4))
        expect(await test.snapBaseSwap()).to.equal(0)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteSwap()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)

        expect(await pool.liquidity()).to.equal(1000000)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(0)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(0)

        let price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect((await pool.slot0()).sqrtPriceX96).to.gte(toSqrtPrice(1.49999999))
        expect((await pool.slot0()).sqrtPriceX96).to.lte(toSqrtPrice(1.50))
    })


    it("swap output exact", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        
        const swapFlow = 15188
        const feeCost = 341
        const liqBonus = 3
        const liqGrowth = 138
        const counterFlow = (swapFlow + feeCost + liqBonus)

        await test.testSwap(false, -10000, toSqrtPrice(2.0))
        expect(await test.snapBaseSwap()).to.equal(counterFlow)
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteSwap()).to.equal(-10000)
        expect(await test.snapQuoteFlow()).to.equal(-10000)

        expect(await pool.liquidity()).to.equal(1000000 + liqGrowth)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(counterFlow)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(-10000)

        let price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.53785)
        expect(price).to.lte(1.53786)
    })

    it("swap output exact proto fee", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        await poolFactory.setOwner(test.address)
        await test.testProtocolSetFee(6)
        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        
        const swapFlow = 15188
        const feeCost = 341
        const liqBonus = 2
        const liqGrowth = 115
        const counterFlow = (swapFlow + feeCost + liqBonus)

        await test.testSwap(false, -10000, toSqrtPrice(2.0))
        expect(await test.snapBaseSwap()).to.equal(counterFlow)
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteSwap()).to.equal(-10000)
        expect(await test.snapQuoteFlow()).to.equal(-10000)

        expect(await pool.liquidity()).to.equal(1000000 + liqGrowth)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(counterFlow)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(-10000)

        let protoFees = (await pool.protocolFees())
        expect(protoFees[0]).to.equal(0)
        expect(protoFees[1]).to.equal(56)
    })

    it("swap limit", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 40000); 
        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        
        let limitFlow = 7663
        let counterFlow = -4333
        let liqGrowth = 58

        await test.testSwap(false, 100000, toSqrtPrice(2.0))
        expect(await test.snapBaseSwap()).to.equal(limitFlow)
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(40000 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.999999)
        expect(price).to.lte(2.0)
    })

    it("swap tick step", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 

        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        await test.testSwap(false, 100000, toSqrtPrice(2.0))

        let limitFlow = 9067
        let counterFlow = -5218
        let liqGrowth = 69

        expect(await test.snapBaseSwap()).to.equal(limitFlow)
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(40000 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.99999)
        expect(price).to.lte(2.0)
    })

    it("swap tick sell", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 

        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        await test.testSwap(true, 100000, toSqrtPrice(1.25))

        let limitFlow = -5456
        let counterFlow = 4018
        let liqGrowth = 47

        expect(await test.snapBaseSwap()).to.equal(limitFlow)
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(40000 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.2499999)
        expect(price).to.lte(1.25)
    })

    it("swap tick protocol fee", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 
        await poolFactory.setOwner(test.address)
        await test.testProtocolSetFee(6)

        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        await test.testSwap(true, 100000, toSqrtPrice(1.25))

        let limitFlow = -5447
        let counterFlow = 4012
        let liqGrowth = 40

        expect(await test.snapBaseSwap()).to.equal(limitFlow)
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(40000 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(limitFlow)

        let protoFees = (await pool.protocolFees())
        expect(protoFees[0]).to.equal(0)
        expect(protoFees[1]).to.equal(17)
    })

    /* This test exists to test for a very specific type of behavior. If we swap to hit a
     * limit barrier we want to make sure that we don't knock in the next liquidity bump. */
    it("swap knock in liquidity at limit", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 

        const liqGrowth = 5

        // 1.525 is just below the 4300th tick... Important to avoid stopping at an empty
        // spill tick, otherwise the behavior isn't tested.
        await test.testSwap(false, 100000, toSqrtPrice(1.525))
        expect(await pool.liquidity()).to.equal(70000 + liqGrowth)

        let price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.524999)
        expect(price).to.lte(1.525)
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
        let counterFlow = -669
        let liqGrowth = 6

        expect(await test.snapBaseSwap()).to.equal(limitFlow)
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(0 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(limitFlow)

        let price = (await pool.slot0()).sqrtPriceX96
        expect(price).to.gte(toSqrtPrice(1000000000))
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
    })


    it("burn payout full", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(3000, 5000, 10000);

        let startBase = await baseToken.balanceOf(test.address)
        let startQuote = await quoteToken.balanceOf(test.address)

        await test.testBurn(3000, 5000, 10000)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote)).to.equal(376)
        expect((await baseToken.balanceOf(test.address)).sub(startBase)).to.equal(629)
        expect(await test.snapQuoteBurn()).to.equal(376)
        expect(await test.snapBaseBurn()).to.equal(629)
     })

    it("burn payout sum full", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(3000, 5000, 10000);

        let startBase = await baseToken.balanceOf(test.address)
        let startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(3000, 5000, 5000)
        await test.testBurn(3000, 5000, 2500)
        await test.testBurn(3000, 5000, 2500)

        expect((await quoteToken.balanceOf(test.address)).sub(startQuote)).to.equal(376)
        expect((await baseToken.balanceOf(test.address)).sub(startBase)).to.equal(628)
        expect(await test.snapQuoteBurn()).to.equal(94)
        expect(await test.snapBaseBurn()).to.equal(157)
     })

     it("burn payout tranche", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-100, 100, 10000);
        await test.testMint(5000, 6000, 10000);
        await test.testMint(3000, 5000, 10000);

        let startBase = await baseToken.balanceOf(test.address)
        let startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(3000, 5000, 2500)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote)).to.equal(94)
        expect((await baseToken.balanceOf(test.address)).sub(startBase)).to.equal(157)

        startBase = await baseToken.balanceOf(test.address)
        startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(-100, 100, 2000)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote)).to.equal(0)
        expect((await baseToken.balanceOf(test.address)).sub(startBase)).to.equal(19)

        startBase = await baseToken.balanceOf(test.address)
        startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(5000, 6000, 10000)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote)).to.equal(379)
        expect((await baseToken.balanceOf(test.address)).sub(startBase)).to.equal(0)
    })

    it("burn liquidity", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-100, 100, 5000);
        await test.testMint(5000, 6000, 6000);
        await test.testBurn(5000, 6000, 2000);
        await test.testBurn(-100, 100, 4000);
        expect(await pool.liquidity()).to.equal(0)
        expect((await pool.slot0()).sqrtPriceX96).to.equal(toSqrtPrice(1.5))
        
        await test.testMint(3000, 5000, 10000);
        await test.testBurn(3000, 5000, 1500);        
        await test.testBurn(3000, 5000, 4500);
        
        expect(await pool.liquidity()).to.equal(4000)
        expect((await pool.slot0()).sqrtPriceX96).to.gte(toSqrtPrice(1.49999999))
        expect((await pool.slot0()).sqrtPriceX96).to.lte(toSqrtPrice(1.50))
    })
})
