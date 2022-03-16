import { TestPool, makeTokenPool, Token } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, ZERO_ADDR } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';

chai.use(solidity);

describe('Pool', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = false;
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
       CONVEX_ADJ = 143
       expect(await test.snapQuoteOwed()).to.equal(377*1024 - CONVEX_ADJ + MINT_BUFFER)
       CONVEX_ADJ = 826
       expect(await test.snapBaseOwed()).to.equal(630*1024 - CONVEX_ADJ + MINT_BUFFER)

       expect(await baseToken.balanceOf((await test.dex).address)).to.equal(730*1024 - 831 + 2*MINT_BUFFER)
       expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(757*1024 - 336 + 2*MINT_BUFFER)
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
        const counterFlow = -6620438

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
        await test.testRevisePool(feeRate, 43, 1)

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        await test.testSwap(true, true, 10000, toSqrtPrice(2.0))

        const swapFlow = 6603 + 57
        const feeCost = 148
        const liqBonus = 1
        const liqGrowth = 75
        const counterFlow = -(swapFlow - feeCost + liqBonus)

        expect(await test.snapBaseFlow()).to.equal(10000)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10000)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(0)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(25)
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
        await test.testRevisePool(feeRate, 43, 1)
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 78901
        const counterFlow = 7038793

        await test.snapStart()
        await test.testSwap(false, true, 10000*1024, toSqrtPrice(1.25))
        expect(await test.snapBaseFlow()).to.equal(-10000*1024)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-10000*1024)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(0)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(25*1024 + 412)
    })

    it("swap wrong direction", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        await test.snapStart()
        await expect((test.testSwap(false, true, 10000*1024, toSqrtPrice(1.55)))).to.be.reverted
        await expect((test.testSwap(true, false, 5000, toSqrtPrice(1.4)))).to.be.reverted
    })

    it("swap buy quote output", async() => {
        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
                
        const liqGrowth = 142858
        const counterFlow = 15904765

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
        const counterFlow = -14839765

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
        await test.testRevisePool(feeRate, 43, 1)
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 118825
        const counterFlow = 15904023

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
        let counterFlow = -4427
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
        let counterFlow = -5343556
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
        let counterFlow = 4117802
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
        await test.testRevisePool(feeRate, 43, 1)

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.snapStart()
        let x = await test.testSwap(false, false, 100000*1024, toSqrtPrice(1.25))

        let limitFlow = -5584332
        let counterFlow = 4109816
        let liqGrowth = 44217

        expect(await test.snapBaseFlow()).to.equal(limitFlow)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(40000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(limitFlow)

        expect(await (await test.query).queryProtocolAccum((await test.base).address)).to.equal(21377)
        expect(await (await test.query).queryProtocolAccum((await test.quote).address)).to.equal(0)
    })

    it("burn payout full", async() => {
        await test.testMint(3000, 5000, 10000);

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        let startTraderQuote = await quoteToken.balanceOf(await (await test.trader).getAddress())
        let startTraderBase = await baseToken.balanceOf((await (await test.trader).getAddress()))

        await test.testBurn(3000, 5000, 10000)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-385905)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-644294)
        expect((await quoteToken.balanceOf(await (await test.trader).getAddress())).sub(startTraderQuote)).to.equal(385905)
        expect((await baseToken.balanceOf(await (await test.trader).getAddress())).sub(startTraderBase)).to.equal(644294)
        expect(await test.snapQuoteFlow()).to.equal(-385905)
        expect(await test.snapBaseFlow()).to.equal(-644294)
     })

     it("burn payout sum full", async() => {
        await test.testMint(3000, 5000, 10000);
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)

        await test.testBurn(3000, 5000, 5000)
        await test.testBurn(3000, 5000, 2500)
        await test.testBurn(3000, 5000, 2500)

        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-385904)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(-644293)
        expect(await test.snapQuoteFlow()).to.equal(-96476)
        expect(await test.snapBaseFlow()).to.equal(-161073)
     })

     it("burn payout tranche", async() => {
        await test.testMint(-100, 100, 10000);
        await test.testMint(5000, 6000, 10000);
        await test.testMint(3000, 5000, 10000);

        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        await test.testBurn(3000, 5000, 2500)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(-96476)
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

    it("mint ambient", async() => {
        await test.testMintAmbient(20000);
        await test.testMintAmbient(5000);
        
        expect(await test.liquidity()).to.equal(25000*1024)
        expect(await test.snapQuoteOwed()).to.equal(4180466)
        expect(await test.snapBaseOwed()).to.equal(6270697)
    })

    it("burn ambient", async() => {
        await test.testMintAmbient(20000);
        await test.testBurnAmbient(3000);
        await test.testBurnAmbient(5000);
        
        expect(await test.liquidity()).to.equal(12000*1024)
        expect(await test.snapQuoteOwed()).to.equal(-4180462)
        expect(await test.snapBaseOwed()).to.equal(-6270693)
    })

    it("mint ambient seed inflator", async() => {
        await test.testMintAmbient(5000);
        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        await test.testSwap(false, true, 10000*1024, toSqrtPrice(1.5))

        let openLiq = (await test.liquidity()).toNumber()
        expect(openLiq).to.gt(5000)

        await test.testMintAmbient(15000); 
        expect(await test.liquidity()).to.equal(openLiq + 15000*1024)

        await test.testBurnAmbient(15000);
        expect(await test.liquidity()).to.equal(openLiq)
        expect(await test.snapQuoteOwed()).to.equal(-12541386)
        expect(await test.snapBaseOwed()).to.equal(-18812079)
    })

    it("burn ambient growth deflator", async() => {
        await test.testMintAmbient(5000);
        await test.testMint(-5000, 8000, 1000); 

        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        await test.testSwap(false, true, 10000*1024, toSqrtPrice(1.5))

        let openLiq = (await test.liquidity()).toNumber()

        await test.testMintAmbient(15000);
        expect(await test.liquidity()).to.equal(openLiq + 15000*1024)

        await test.testBurnAmbient(5000);
        expect(await test.liquidity()).to.equal(openLiq + 15000*1024 - 5000*1024)
        expect(await test.snapQuoteOwed()).to.equal(-4180461)
        expect(await test.snapBaseOwed()).to.equal(-6270692)
    })

    it("burn ambient post growth deflator", async() => {
        await test.testMintAmbient(5000);
        await test.testMintAmbient(15000);

        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        await test.testSwap(false, true, 10000*1024, toSqrtPrice(1.5))

        let openLiq = (await test.liquidity()).toNumber()
        await test.testBurnAmbient(5000);
        const ROUND_DOWN = 1
        expect(await test.liquidity()).to.equal(openLiq - 5000*1024 + ROUND_DOWN)
        expect(await test.snapQuoteOwed()).to.equal(-4180461)
        expect(await test.snapBaseOwed()).to.equal(-6270692)
    })


    it("burn ambient over provision", async() => {
        await test.testMintAmbient(5000);

        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        await test.testSwap(false, true, 10000*1024, toSqrtPrice(1.5))

        await test.testBurnAmbient(6000);
        expect(await test.liquidity()).to.equal(0)
        expect(await test.snapQuoteOwed()).to.equal(-4194040)
        expect(await test.snapBaseOwed()).to.equal(-6291061)
    })

})
