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

describe('Pool', () => {
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
       
       await baseToken.deposit(test.address, 100000000000);
       await quoteToken.deposit(test.address, 100000000000); 
       await baseToken.deposit(testZero.address, 100000000000);
       await quoteToken.deposit(testZero.address, 100000000000); 
    })

    const MINT_BUFFER = 4;

    it("mint collection", async() => {
       await pool.initialize(toSqrtPrice(1.5))
       await test.testMint(-100, 100, 10000);
       expect(await test.snapQuoteOwed()).to.equal(0)
       expect(await test.snapQuoteMint()).to.equal(0)
       let CONVEX_ADJ = 5
       expect(await test.snapBaseOwed()).to.equal(100*1024 - CONVEX_ADJ + MINT_BUFFER)
       expect(await test.snapBaseMint()).to.equal(100*1024 - CONVEX_ADJ + MINT_BUFFER)

       await test.testMint(5000, 6000, 10000);
       CONVEX_ADJ = 193
       expect(await test.snapQuoteOwed()).to.equal(380*1024 - CONVEX_ADJ + MINT_BUFFER)
       expect(await test.snapQuoteMint()).to.equal(380*1024 - CONVEX_ADJ + MINT_BUFFER)
       expect(await test.snapBaseOwed()).to.equal(0)
       expect(await test.snapBaseMint()).to.equal(0)

       await test.testMint(3000, 5000, 10000);
       CONVEX_ADJ = 143
       expect(await test.snapQuoteOwed()).to.equal(377*1024 - CONVEX_ADJ + MINT_BUFFER)
       expect(await test.snapQuoteMint()).to.equal(377*1024 - CONVEX_ADJ + MINT_BUFFER)
       CONVEX_ADJ = 826
       expect(await test.snapBaseMint()).to.equal(630*1024 - CONVEX_ADJ + MINT_BUFFER)
       expect(await test.snapBaseOwed()).to.equal(630*1024 - CONVEX_ADJ + MINT_BUFFER)

       expect(await baseToken.balanceOf(pool.address)).to.equal(730*1024 - 831 + 2*MINT_BUFFER)
       expect(await quoteToken.balanceOf(pool.address)).to.equal(757*1024 - 336 + 2*MINT_BUFFER)
    })

    it("mint liquidity", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-100, 100, 5000);
        await test.testMint(5000, 6000, 6000);
        expect(await pool.liquidity()).to.equal(0)
        expect((await pool.slot0()).sqrtPriceX96).to.equal(toSqrtPrice(1.5))
        
        await test.testMint(3000, 5000, 10000);
        await test.testMint(3500, 4500, 20000);
        expect(await pool.liquidity()).to.equal(30000*1024)
        expect((await pool.slot0()).sqrtPriceX96).to.equal(toSqrtPrice(1.5))
    })

    it("swap simple", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        
        const liqGrowth = 93172
        const counterFlow = -6620438

        await test.testSwap(false, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseSwap()).to.equal(10240000)
        expect(await test.snapBaseFlow()).to.equal(10240000)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(10240000)

        let price = fromSqrtPrice((await pool.slot0()).sqrtPriceX96)
        expect(price).to.gte(1.524317)
        expect(price).to.lte(1.524318)
    })
    

    it("swap protocol fee", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        await poolFactory.setOwner(test.address)
        await test.testProtocolSetFee(6)

        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        await test.testSwap(false, 10000, toSqrtPrice(2.0))

        const swapFlow = 6603 + 57
        const feeCost = 148
        const liqBonus = 1
        const liqGrowth = 75
        const counterFlow = -(swapFlow - feeCost + liqBonus)

        expect(await test.snapBaseSwap()).to.equal(10000)
        expect(await test.snapBaseFlow()).to.equal(10000)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(1000000*1024 + liqGrowth)
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
        
        const liqGrowth = 94828
        const counterFlow = 7039007

        await test.testSwap(true, -10000*1024, toSqrtPrice(1.25))
        expect(await test.snapBaseSwap()).to.equal(-10000*1024)
        expect(await test.snapBaseFlow()).to.equal(-10000*1024)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(-10000*1024)

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

        const liqGrowth = 79025
        const counterFlow = 7038795

        await test.testSwap(true, -10000*1024, toSqrtPrice(1.25))
        expect(await test.snapBaseSwap()).to.equal(-10000*1024)
        expect(await test.snapBaseFlow()).to.equal(-10000*1024)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(-10000*1024)

        let protoFees = (await pool.protocolFees())
        expect(protoFees[0]).to.equal(25*1024 + 210)
        expect(protoFees[1]).to.equal(0)
    })

    it("swap wrong direction", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        
        await test.testSwap(true, -10000*1024, toSqrtPrice(1.55))
        expect(await test.snapBaseSwap()).to.equal(0)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteSwap()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)

        expect(await pool.liquidity()).to.equal(1000000*1024)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(0)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(0)

        await test.testSwap(false, 5000, toSqrtPrice(1.4))
        expect(await test.snapBaseSwap()).to.equal(0)
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteSwap()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)

        expect(await pool.liquidity()).to.equal(1000000*1024)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(0)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(0)

        expect((await pool.slot0()).sqrtPriceX96).to.gte(toSqrtPrice(1.49999999))
        expect((await pool.slot0()).sqrtPriceX96).to.lte(toSqrtPrice(1.50))
    })


    it("swap output exact", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        
        const liqGrowth = 142858
        const counterFlow = 15904765

        await test.testSwap(false, -10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseSwap()).to.equal(counterFlow)
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteSwap()).to.equal(-10000*1024)
        expect(await test.snapQuoteFlow()).to.equal(-10000*1024)

        expect(await pool.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(counterFlow)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(-10000*1024)

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
        
        const liqGrowth = 119011
        const counterFlow = 15904029

        await test.testSwap(false, -10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseSwap()).to.equal(counterFlow)
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteSwap()).to.equal(-10000*1024)
        expect(await test.snapQuoteFlow()).to.equal(-10000*1024)

        expect(await pool.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(counterFlow)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(-10000*1024)

        let protoFees = (await pool.protocolFees())
        expect(protoFees[0]).to.equal(0)
        expect(protoFees[1]).to.equal(58407)
    })

    it("swap limit", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 40); 
        let startQuote = await quoteToken.balanceOf(pool.address)
        let startBase = await baseToken.balanceOf(pool.address)
        
        let limitFlow = 7853
        let counterFlow = -4427
        let liqGrowth = 1020

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
        await test.testSwap(false, 100000*1024, toSqrtPrice(2.0))

        let limitFlow = 9284923
        let counterFlow = -5343556
        let liqGrowth = 76491

        expect(await test.snapBaseSwap()).to.equal(limitFlow)
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(40000*1024 + liqGrowth)
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
        await test.testSwap(true, 100000*1024, toSqrtPrice(1.25))

        let limitFlow = -5595727
        let counterFlow = 4117802
        let liqGrowth = 53147

        expect(await test.snapBaseSwap()).to.equal(limitFlow)
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(40000*1024 + liqGrowth)
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
        await test.testSwap(true, 100000*1024, toSqrtPrice(1.25))

        let limitFlow = -5584420
        let counterFlow = 4109879
        let liqGrowth = 44287

        expect(await test.snapBaseSwap()).to.equal(limitFlow)
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteSwap()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await pool.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf(pool.address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf(pool.address)).sub(startBase)).to.equal(limitFlow)

        let protoFees = (await pool.protocolFees())
        expect(protoFees[0]).to.equal(0)
        expect(protoFees[1]).to.equal(21211)
    })


    it("burn payout full", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(3000, 5000, 10000);

        let startBase = await baseToken.balanceOf(test.address)
        let startQuote = await quoteToken.balanceOf(test.address)

        await test.testBurn(3000, 5000, 10000)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote)).to.equal(385905)
        expect((await baseToken.balanceOf(test.address)).sub(startBase)).to.equal(644294)
        expect(await test.snapQuoteBurn()).to.equal(385905)
        expect(await test.snapBaseBurn()).to.equal(644294)
     })

    it("burn payout sum full", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(3000, 5000, 10000);

        let startBase = await baseToken.balanceOf(test.address)
        let startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(3000, 5000, 5000)
        await test.testBurn(3000, 5000, 2500)
        await test.testBurn(3000, 5000, 2500)

        expect((await quoteToken.balanceOf(test.address)).sub(startQuote)).to.equal(385904)
        expect((await baseToken.balanceOf(test.address)).sub(startBase)).to.equal(644293)
        expect(await test.snapQuoteBurn()).to.equal(96476)
        expect(await test.snapBaseBurn()).to.equal(161073)
     })

     it("burn payout tranche", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-100, 100, 10000);
        await test.testMint(5000, 6000, 10000);
        await test.testMint(3000, 5000, 10000);

        let startBase = await baseToken.balanceOf(test.address)
        let startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(3000, 5000, 2500)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote)).to.equal(96476)
        expect((await baseToken.balanceOf(test.address)).sub(startBase)).to.equal(161073)

        startBase = await baseToken.balanceOf(test.address)
        startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(-100, 100, 2000)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote)).to.equal(0)
        expect((await baseToken.balanceOf(test.address)).sub(startBase)).to.equal(20479)

        startBase = await baseToken.balanceOf(test.address)
        startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(5000, 6000, 10000)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote)).to.equal(388927)
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
        
        expect(await pool.liquidity()).to.equal(4000*1024)
        expect((await pool.slot0()).sqrtPriceX96).to.gte(toSqrtPrice(1.49999999))
        expect((await pool.slot0()).sqrtPriceX96).to.lte(toSqrtPrice(1.50))
    })


    it("burn payout rewards", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-10000, 25000, 1000000);

        // Estabilish the pre-reward collateral commitment...
        let startBase = await baseToken.balanceOf(test.address)
        let startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(-10000, 25000, 100000)
        let collateralBase = ((await baseToken.balanceOf(test.address)).sub(startBase))
        let collateralQuote = ((await quoteToken.balanceOf(test.address)).sub(startQuote))

        // Collect rewards and bring back to original price
        await test.testSwap(false, 10000, toSqrtPrice(1.7))
        await test.testSwap(true, 100000, toSqrtPrice(1.5))

        startBase = await baseToken.balanceOf(test.address)
        startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(-10000, 25000, 100000)
        // The formula below backs out the rewards portion of the burn
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote).sub(collateralQuote)).to.equal(15)
        expect((await baseToken.balanceOf(test.address)).sub(startBase).sub(collateralBase)).to.equal(23)

        // Subsequent burns should collect rewards at same rate.
        startBase = await baseToken.balanceOf(test.address)
        startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(-10000, 25000, 100000)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote).sub(collateralQuote)).to.equal(15)
        expect((await baseToken.balanceOf(test.address)).sub(startBase).sub(collateralBase)).to.equal(23)

        // Subsequent burns should stack upon previously unredeemed fraction of the rewards. I.e. not reset
        // rewards for the unburned liquidity.
        await test.testSwap(false, 10000, toSqrtPrice(1.7))
        await test.testSwap(true, 100000, toSqrtPrice(1.5))
        startBase = await baseToken.balanceOf(test.address)
        startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(-10000, 25000, 100000)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote).sub(collateralQuote)).to.equal(36)
        expect((await baseToken.balanceOf(test.address)).sub(startBase).sub(collateralBase)).to.equal(55)
    })

    it("mint blends rewards", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-10000, 25000, 1000000);

        // Estabilish the pre-reward collateral commitment...
        let startBase = await baseToken.balanceOf(test.address)
        let startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(-10000, 25000, 250000)
        let collateralBase = ((await baseToken.balanceOf(test.address)).sub(startBase))
        let collateralQuote = ((await quoteToken.balanceOf(test.address)).sub(startQuote))

        await test.testSwap(false, 10000, toSqrtPrice(1.7))
        await test.testSwap(true, 100000, toSqrtPrice(1.5))

        // Burn should collect rewards at the blended rate of the previously stacked liquidity
        startBase = await baseToken.balanceOf(test.address)
        startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(-10000, 25000, 250000)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote).sub(collateralQuote)).to.equal(48)
        expect((await baseToken.balanceOf(test.address)).sub(startBase).sub(collateralBase)).to.equal(72)
        
        // Minting on top of previously rewarded liquidity should require the same collateral commitment
        // (Roughtly accounting for minor differences in price...)
        startBase = await baseToken.balanceOf(test.address)
        startQuote = await quoteToken.balanceOf(test.address)
        await test.testMint(-10000, 25000, 250000)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote).sub(-collateralQuote)).to.gte(-4)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote).sub(-collateralQuote)).to.lte(0)
        expect((await baseToken.balanceOf(test.address)).sub(startBase).sub(-collateralBase)).to.gte(-4)
        expect((await baseToken.balanceOf(test.address)).sub(startBase).sub(-collateralBase)).to.lte(0)

        // Burn should collect rewards at the blended rate of the previously stacked liquidity
        startBase = await baseToken.balanceOf(test.address)
        startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(-10000, 25000, 250000)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote).sub(collateralQuote)).to.equal(31)
        expect((await baseToken.balanceOf(test.address)).sub(startBase).sub(collateralBase)).to.equal(47)

        // Adding more liquidity at higher rewards mark should blend down the rewards rate per unit burned 
        await test.testMint(-10000, 25000, 250000)
        startBase = await baseToken.balanceOf(test.address)
        startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(-10000, 25000, 250000)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote).sub(collateralQuote)).to.equal(21)
        expect((await baseToken.balanceOf(test.address)).sub(startBase).sub(collateralBase)).to.equal(31)        

        // Rewards rate on subsequent burns should remain the at the same blended rate
        startBase = await baseToken.balanceOf(test.address)
        startQuote = await quoteToken.balanceOf(test.address)
        await test.testBurn(-10000, 25000, 250000)
        expect((await quoteToken.balanceOf(test.address)).sub(startQuote).sub(collateralQuote)).to.equal(21)
        expect((await baseToken.balanceOf(test.address)).sub(startBase).sub(collateralBase)).to.equal(31)        
    })

    it("transfer liquidity", async() => {
        await pool.initialize(toSqrtPrice(1.0))
        await test.testMint(-100, 100, 5000);
        await test.testMint(-100, 100, 5000);
        await test.testTransfer(test2.address, -100, 100)
        expect(await pool.liquidity()).to.equal(10000*1024)
        expect((await pool.slot0()).sqrtPriceX96).to.equal(toSqrtPrice(1.0))
        
        await test2.testBurn(-100, 100, 10000)
        expect((await quoteToken.balanceOf(test2.address))).to.equal(51069)
        expect((await baseToken.balanceOf(test2.address))).to.equal(51069)
        expect(await pool.liquidity()).to.equal(0)

        // Verify liqudity was destroyed at the old address
        expect(test.testBurn(-100, 100, 1)).to.be.reverted
    })
})
