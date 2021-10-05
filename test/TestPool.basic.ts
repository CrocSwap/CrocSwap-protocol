import { TestPool } from './FacadePool'
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
    let test: TestPool
    let baseToken: MockERC20
    let quoteToken: MockERC20
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       let factory = await ethers.getContractFactory("MockERC20")
       baseToken = await factory.deploy() as MockERC20
       quoteToken = await factory.deploy() as MockERC20

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

        await test.testSwap(false, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(10240000)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10240000)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.524317)
        expect(price).to.lte(1.524318)
    })
    

})
