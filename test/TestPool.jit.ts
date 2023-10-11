import { TestPool, makeTokenPool, Token } from '../test/FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from '../test/FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { ConcentratedDirective } from '../test/EncodeOrder';
import { BigNumber } from 'ethers';

chai.use(solidity);

describe('Pool JIT', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 0

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 15, 1.5)
       test.useHotPath = false
    })

    it("jit window", async() => {
        await test.testMint(3030, 6030, 1000)
        await test.testBurn(3030, 6030, 400) // No error since JIT defaults to 0

        // Set JIT time out to 30 seconds. Should time out.
        await test.testRevisePool(feeRate, 0, 15, 30) 
        expect(test.testBurn(3030, 6030, 400)).to.be.reverted
        expect(await test.liquidity()).to.eq(600*1024)
    })

    it("mint in window", async() => {
        await test.testMint(3030, 6030, 1000)
        await test.testBurn(3030, 6030, 400) // No error since JIT defaults to 0

        await test.testRevisePool(feeRate, 0, 15, 30) 
        await test.testMint(3030, 6030, 1000) // Should be fine to mint within window
    })

    it("jit window too large", async() => {
        await test.testMint(3030, 6030, 1000)
        await test.testBurn(3030, 6030, 400) // No error since JIT defaults to 0

        // 256 seconds is above maximum JIT threshold time
        expect(test.testRevisePool(feeRate, 0, 15, 256)).to.be.reverted
    })
})
