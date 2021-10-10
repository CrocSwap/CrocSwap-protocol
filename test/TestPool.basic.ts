import { TestPool } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';

chai.use(solidity);

describe('Pool', () => {
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

    const MINT_BUFFER = 4;

    it("mint collection", async() => {
       await test.testMint(-100, 100, 10000);
       expect(await test.snapQuoteOwed()).to.equal(0)
       let CONVEX_ADJ = 5
       expect(await test.snapBaseOwed()).to.equal(100*1024 - CONVEX_ADJ + MINT_BUFFER)

       await test.testMint(5000, 6000, 10000);
       CONVEX_ADJ = 193
       expect(await test.snapQuoteOwed()).to.equal(380*1024 - CONVEX_ADJ + MINT_BUFFER)
       expect(await test.snapBaseOwed()).to.equal(0)

       await test.testMint(3000, 5000, 10000);
       CONVEX_ADJ = 144
       expect(await test.snapQuoteOwed()).to.equal(377*1024 - CONVEX_ADJ + MINT_BUFFER)
       CONVEX_ADJ = 826
       expect(await test.snapBaseOwed()).to.equal(630*1024 - CONVEX_ADJ + MINT_BUFFER)

       expect(await baseToken.balanceOf((await test.dex).address)).to.equal(730*1024 - 831 + 2*MINT_BUFFER)
       expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(757*1024 - 325 + 2*MINT_BUFFER)
    })

    it("mint liquidity", async() => {
        await test.testMint(-100, 100, 5000);
        await test.testMint(5000, 6000, 6000);
        expect(await test.liquidity()).to.equal(0)
        expect((await test.price())).to.equal(toSqrtPrice(1.5))
        
        await test.testMint(3000, 5000, 10000);
        await test.testMint(3500, 4500, 20000);
        expect(await test.liquidity()).to.equal(30000*1024)
        expect((await test.price())).to.equal(toSqrtPrice(1.5))
    })

    it("swap simple", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 93172
        const counterFlow = -6620436

        await test.snapStart()
        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(10240000)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10240000)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.524317)
        expect(price).to.lte(1.524318)
    })
    
    it("swap protocol fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testProtocolSetFee(6)

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(true, true, 10000, toSqrtPrice(2.0))

        const swapFlow = 6602 + 57
        const feeCost = 148
        const liqBonus = 1
        const liqGrowth = 75
        const counterFlow = -(swapFlow - feeCost + liqBonus)

        expect(await test.snapBaseFlow()).to.equal(10000)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10000)

        expect(await (await test.dex).protoFeeAccum((await test.quote).address)).to.equal(24)
        expect(await (await test.dex).protoFeeAccum((await test.base).address)).to.equal(0)
    })

    it("swap sell", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 94828
        const counterFlow = 7039007

        await test.snapStart()
        await test.testSwap(false,  true, 10000*1024, toSqrtPrice(1.25))
        expect(await test.snapBaseFlow()).to.equal(-10000*1024)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-10000*1024)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.47533)
        expect(price).to.lte(1.47534)
    })

    it("swap sell protocol fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testProtocolSetFee(6)
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 79025
        const counterFlow = 7038795

        await test.snapStart()
        await test.testSwap(false, true, 10000*1024, toSqrtPrice(1.25))
        expect(await test.snapBaseFlow()).to.equal(-10000*1024)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-10000*1024)

        expect(await (await test.dex).protoFeeAccum((await test.quote).address)).to.equal(25*1024 + 210)
        expect(await (await test.dex).protoFeeAccum((await test.base).address)).to.equal(0)
    })

    it("swap wrong direction", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        await test.snapStart()
        await test.testSwap(false, true, 10000*1024, toSqrtPrice(1.55))
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)

        expect(await test.liquidity()).to.equal(1000000*1024)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(0)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(0)


        await test.testSwap(true, false, 5000, toSqrtPrice(1.4))
        expect(await test.snapBaseFlow()).to.equal(0)
        expect(await test.snapQuoteFlow()).to.equal(0)

        expect(await test.liquidity()).to.equal(1000000*1024)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(0)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(0)

        expect((await test.price())).to.gte(toSqrtPrice(1.49999999))
        expect((await test.price())).to.lte(toSqrtPrice(1.50))
    })

    it("swap buy quote output", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
                
        const liqGrowth = 142858
        const counterFlow = 15904766

        await test.snapStart()
        await test.testSwap(true, false, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(-10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.53785)
        expect(price).to.lte(1.53786)
    })

    it("swap sell quote output", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
                
        const liqGrowth = 138168
        const counterFlow = -14839766

        await test.snapStart()
        await test.testSwap(false, false, 10000*1024, toSqrtPrice(1.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.46431)
        expect(price).to.lte(1.46432)
    })

    it("swap buy quote proto fee", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.testProtocolSetFee(6)
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 119011
        const counterFlow = 15904029

        await test.snapStart()
        await test.testSwap(true, false, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(counterFlow)
        expect(await test.snapQuoteFlow()).to.equal(-10000*1024)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-10000*1024)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(counterFlow)
    })

    it("swap limit", async() => {
        await test.testMint(-5000, 8000, 40); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        let limitFlow = 7853
        let counterFlow = -4426
        let liqGrowth = 1020

        await test.snapStart()
        await test.testSwap(true, true, 100000, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.999999)
        expect(price).to.lte(2.0)
    })

    it("swap tick step", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(true, true, 100000*1024, toSqrtPrice(2.0))

        let limitFlow = 9284923
        let counterFlow = -5343553
        let liqGrowth = 76491

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.999999)
        expect(price).to.lte(2.0)
    })

    it("swap tick sell", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(false, false, 100000*1024, toSqrtPrice(1.25))

        let limitFlow = -5595727
        let counterFlow = 4117799
        let liqGrowth = 53147

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.249999)
        expect(price).to.lte(1.25)
    })

    it("swap tick protocol fee", async() => {
        await test.testMint(-5000, 8000, 40000); 
        await test.testMint(3800, 4300, 30000); 
        await test.testMint(3400, 4800, 20000); 
        await test.testProtocolSetFee(6)

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(false, false, 100000*1024, toSqrtPrice(1.25))

        let limitFlow = -5584421
        let counterFlow = 4109877
        let liqGrowth = 44287

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        expect(await (await test.dex).protoFeeAccum((await test.quote).address)).to.equal(0)
        expect(await (await test.dex).protoFeeAccum((await test.base).address)).to.equal(21211)
    })

    it("burn payout full", async() => {
        await test.testMint(3000, 5000, 10000);

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        let startTraderQuote = await quoteToken.balanceOf(await (await test.trader).getAddress())
        let startTraderBase = await baseToken.balanceOf((await (await test.trader).getAddress()))

        await test.testBurn(3000, 5000, 10000)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-385904)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-644294)
        expect((await quoteToken.balanceOf(await (await test.trader).getAddress())).sub(startTraderQuote)).to.equal(385904)
        expect((await baseToken.balanceOf(await (await test.trader).getAddress())).sub(startTraderBase)).to.equal(644294)
        expect(await test.snapQuoteFlow()).to.equal(-385904)
        expect(await test.snapBaseFlow()).to.equal(-644294)
     })

     it("burn payout sum full", async() => {
        await test.testMint(3000, 5000, 10000);
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.testBurn(3000, 5000, 5000)
        await test.testBurn(3000, 5000, 2500)
        await test.testBurn(3000, 5000, 2500)

        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-385902)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-644293)
        expect(await test.snapQuoteFlow()).to.equal(-96475)
        expect(await test.snapBaseFlow()).to.equal(-161073)
     })

     it("burn payout tranche", async() => {
        await test.testMint(-100, 100, 10000);
        await test.testMint(5000, 6000, 10000);
        await test.testMint(3000, 5000, 10000);

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testBurn(3000, 5000, 2500)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-96475)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-161073)

        startQuote = await quoteToken.balanceOf((await test.dex).address)
        startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testBurn(-100, 100, 2000)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(0)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-20479)

        startQuote = await quoteToken.balanceOf((await test.dex).address)
        startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testBurn(5000, 6000, 10000)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-388927)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(0)
    })

    it("burn liquidity", async() => {
        await test.testMint(-100, 100, 5000);
        await test.testMint(5000, 6000, 6000);
        await test.testBurn(5000, 6000, 2000);
        await test.testBurn(-100, 100, 4000);
        expect(await test.liquidity()).to.equal(0)
        expect((await test.price())).to.equal(toSqrtPrice(1.5))
        
        await test.testMint(3000, 5000, 10000);
        await test.testBurn(3000, 5000, 1500);        
        await test.testBurn(3000, 5000, 4500);
        
        expect(await test.liquidity()).to.equal(4000*1024)
        expect((await test.price())).to.gte(toSqrtPrice(1.49999999))
        expect((await test.price())).to.lte(toSqrtPrice(1.50))
    })


    it("burn payout rewards", async() => {
        await test.testMint(-10000, 25000, 1000000);

        // Estabilish the pre-reward collateral commitment...
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testBurn(-10000, 25000, 100000)
        let collateralBase = ((await baseToken.balanceOf((await test.dex).address)).sub(startBase))
        let collateralQuote = ((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote))

        // Collect rewards and bring back to original price
        await test.testSwap(true, true, 10000, toSqrtPrice(1.7))
        await test.testSwap(false, false, 100000, toSqrtPrice(1.5))

        startQuote = await quoteToken.balanceOf((await test.dex).address)
        startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testBurn(-10000, 25000, 100000)
        // The formula below backs out the rewards portion of the burn
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote).sub(collateralQuote)).to.equal(-15)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase).sub(collateralBase)).to.equal(-23)

        // Subsequent burns should collect rewards at same rate.
        startQuote = await quoteToken.balanceOf((await test.dex).address)
        startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testBurn(-10000, 25000, 100000)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote).sub(collateralQuote)).to.equal(-15)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase).sub(collateralBase)).to.equal(-23)

        // Subsequent burns should stack upon previously unredeemed fraction of the rewards. I.e. not reset
        // rewards for the unburned liquidity.
        await test.testSwap(true, true, 10000, toSqrtPrice(1.7))
        await test.testSwap(false, false, 100000, toSqrtPrice(1.5))
        startQuote = await quoteToken.balanceOf((await test.dex).address)
        startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testBurn(-10000, 25000, 100000)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote).sub(collateralQuote)).to.equal(-36)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase).sub(collateralBase)).to.equal(-55)
    })


    it("mint blends rewards", async() => {
        await test.testMint(-10000, 25000, 1000000);

        // Estabilish the pre-reward collateral commitment...
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testBurn(-10000, 25000, 250000)
        let collateralBase = ((await baseToken.balanceOf((await test.dex).address)).sub(startBase))
        let collateralQuote = ((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote))

        await test.testSwap(true, true, 10000, toSqrtPrice(1.7))
        await test.testSwap(false, false, 100000, toSqrtPrice(1.5))

        // Burn should collect rewards at the blended rate of the previously stacked liquidity
        startQuote = await quoteToken.balanceOf((await test.dex).address)
        startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testBurn(-10000, 25000, 250000)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote).sub(collateralQuote)).to.equal(-48)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase).sub(collateralBase)).to.equal(-72)
        
        // Minting on top of previously rewarded liquidity should require the same collateral commitment
        // (Roughtly accounting for minor differences in price...)
        startQuote = await quoteToken.balanceOf((await test.dex).address)
        startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testMint(-10000, 25000, 250000)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote).sub(-collateralQuote)).to.lte(4)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote).sub(-collateralQuote)).to.gte(0)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase).sub(-collateralBase)).to.lte(4)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase).sub(-collateralBase)).to.gte(0)

        // Burn should collect rewards at the blended rate of the previously stacked liquidity
        startQuote = await quoteToken.balanceOf((await test.dex).address)
        startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testBurn(-10000, 25000, 250000)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote).sub(collateralQuote)).to.equal(-31)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase).sub(collateralBase)).to.equal(-47)

        // Adding more liquidity at higher rewards mark should blend down the rewards rate per unit burned 
        await test.testMint(-10000, 25000, 250000)
        startBase = await baseToken.balanceOf((await test.dex).address)
        startQuote = await quoteToken.balanceOf((await test.dex).address)
        await test.testBurn(-10000, 25000, 250000)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote).sub(collateralQuote)).to.equal(-21)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase).sub(collateralBase)).to.equal(-31)        

        // Rewards rate on subsequent burns should remain the at the same blended rate
        startBase = await baseToken.balanceOf((await test.dex).address)
        startQuote = await quoteToken.balanceOf((await test.dex).address)
        await test.testBurn(-10000, 25000, 250000)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote).sub(collateralQuote)).to.equal(-21)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase).sub(collateralBase)).to.equal(-31)        
    })
})
