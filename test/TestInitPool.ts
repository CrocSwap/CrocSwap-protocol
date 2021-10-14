import { TestPool, makeTokenPool, Token, makeEtherPool } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber } from 'ethers';

chai.use(solidity);

describe('Initialize Pool', () => {
    let test: TestPool
    let testEther: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100
    const initLiq = 250000

    beforeEach("deploy",  async () => {
       test = await makeEtherPool()
       baseToken = await test.base
       quoteToken = await test.quote

       // Price puts tick around 207,000

       await test.testSetInitLiq(250000)
    })

    it("init token pool", async() => {
        await test.initPool(feeRate, 0, 1, 25.0)

        expect(await test.liquidity()).to.equal(250000)
        expect(await test.price()).to.equal(25.0)
        expect(await baseToken.balanceOf((await test.dex).address)).to.equal(50000)
        expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(1250000)
     })

     it("init ether pool", async() => {
        await testEther.initPool(feeRate, 0, 1, 25.0)

        expect(await test.liquidity()).to.equal(250000)
        expect(await test.price()).to.equal(25.0)
        expect(await baseToken.balanceOf((await test.dex).address)).to.equal(50000)
        expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(1250000)
     })

})


