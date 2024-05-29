import { TestPool, makeTokenPool, Token } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber } from 'ethers';
import { TestTickMath, TestUniCompat } from '../typechain';

chai.use(solidity);

describe('Uni Compatibility Libraries', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    let math: TestTickMath

    const feeRate = 225 * 100
    const poolPrice = 325743212

    beforeEach("deploy",  async () => {
       const libFactory = await ethers.getContractFactory("TestTickMath");
       math = (await libFactory.deploy()) as TestTickMath
        
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, poolPrice)
       test.useHotPath = true
       test.liqQty = true

       await test.fundTokens(BigNumber.from(10).pow(26))
    })


    it("getLiquidityAmounts", async() => {
        let uniLibFactory = await ethers.getContractFactory("TestUniCompat")
        let uniLib = await uniLibFactory.deploy() as TestUniCompat

        const lowerTick = 195056
        const upperTick = 196976

        const lowerPrice = await math.testRatio(lowerTick)
        const upperPrice = await math.testRatio(upperTick)

        const quoteQty = 4546806
        const baseQty = 1446711801938050

        // Use getLiquityForAmounts to find a liquidity floor for above quantities
        let liquidity = await uniLib.getLiquidityForAmountsNative(
            toSqrtPrice(poolPrice), lowerPrice, upperPrice,
            quoteQty, baseQty)

        expect(liquidity.mod(2048)).eq(0)

        // Mint with the derived liquidity amount
        test.liqQty = false
        test.liqLots = false
        await test.testMint(lowerTick, upperTick, liquidity)

        let quote = await test.snapQuoteOwed()
        let base = await test.snapBaseOwed()

        // Verify the floor is below the specified quantities and tight on the base side
        expect(base).to.lt(baseQty)
        expect(base).to.gt(baseQty * 0.999)
        expect(quote).to.lt(quoteQty)
    })
})