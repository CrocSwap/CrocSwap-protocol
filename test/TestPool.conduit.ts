import { TestPool, makeTokenPool, Token, POOL_IDX } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, MAX_PRICE, MIN_PRICE, Q_48 } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { MockLpConduit } from '../typechain/MockLpConduit';
import { ContractFactory } from 'ethers';

chai.use(solidity);

describe('Pool Conduit', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    let conduit: MockLpConduit
    let rejConduit: MockLpConduit
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {

       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = true

       let factory = await ethers.getContractFactory("MockLpConduit") as ContractFactory
       conduit = (await factory.deploy(true)) as MockLpConduit
       rejConduit = (await factory.deploy(false)) as MockLpConduit
       test.lpConduit = conduit.address
    })

    const MINT_BUFFER = 4;

    it("mint ambient", async() => {
        await test.testMintAmbient(5000)
        expect(await conduit.hashMatches(baseToken.address, quoteToken.address, POOL_IDX)).to.be.true
        expect(await conduit.senderSnap_()).to.eq(await (await test.trader).getAddress())
        expect(await conduit.lowerSnap_()).to.eq(0)
        expect(await conduit.upperSnap_()).to.eq(0)
        expect(await conduit.liqSnap_()).to.eq(5000*1024)
        expect(await conduit.mileageSnap_()).to.eq(0)
    })

    it("burn ambient", async() => {
        await test.testMintAmbient(10000)
        await test.testBurnAmbient(5000)
        expect(await conduit.hashMatches(baseToken.address, quoteToken.address, POOL_IDX)).to.be.true
        expect(await conduit.senderSnap_()).to.eq(await (await test.trader).getAddress())
        expect(await conduit.lowerSnap_()).to.eq(0)
        expect(await conduit.upperSnap_()).to.eq(0)
        expect(await conduit.liqSnap_()).to.eq(5000*1024)
        expect(await conduit.mileageSnap_()).to.eq(0)
    })

    it("mint ambient deflator", async() => {
        await test.testMintAmbient(5000)
        await test.testSwap(true, true, 2500000, MAX_PRICE)
        await test.testMintAmbient(8000)

        // Liquidity seeds should be deflated somewhere aroudn 1% at mint time.
        expect(await conduit.liqSnap_()).to.lt(8000*1024)
        expect(await conduit.liqSnap_()).to.gt(7950*1024)
    })

    it("mint concentrated", async() => {
        await test.testMint(-25000, 85000, 5000)
        expect(await conduit.hashMatches(baseToken.address, quoteToken.address, POOL_IDX)).to.be.true
        expect(await conduit.senderSnap_()).to.eq(await (await test.trader).getAddress())
        expect(await conduit.lowerSnap_()).to.eq(-25000)
        expect(await conduit.upperSnap_()).to.eq(85000)
        expect(await conduit.liqSnap_()).to.eq(5000*1024)
        expect(await conduit.mileageSnap_()).to.eq(0)
    })

    it("burn concentrated", async() => {
        await test.testMint(-25000, 85000, 5000)
        await test.testMint(-25000, 85000, 2000)
        expect(await conduit.hashMatches(baseToken.address, quoteToken.address, POOL_IDX)).to.be.true
        expect(await conduit.senderSnap_()).to.eq(await (await test.trader).getAddress())
        expect(await conduit.lowerSnap_()).to.eq(-25000)
        expect(await conduit.upperSnap_()).to.eq(85000)
        expect(await conduit.liqSnap_()).to.eq(2000*1024)
        expect(await conduit.mileageSnap_()).to.eq(0)
    })

    it("mint concentrated deflator", async() => {
        await test.testMint(-25000, 85000, 5000)
        await test.testSwap(true, true, 2500000, MAX_PRICE)
        await test.testSwap(false, true, 2500000, MIN_PRICE)
        await test.testMint(-25000, 85000, 5000)

        let mileage = (await conduit.mileageSnap_()).toNumber() / (2 ** 48)
        expect(mileage).to.lt(0.01)
        expect(mileage).to.gt(0.005)
        expect(await conduit.liqSnap_()).to.eq(5000*1024)
    })

    it("mint reject", async() => {
        test.lpConduit = rejConduit.address
        await expect(test.testMintAmbient(5000)).to.be.reverted
        await expect(test.testMint(-25000, 85000, 5000)).to.be.reverted
    })

    it("burn reject", async() => {
        await test.testMintAmbient(5000)
        await test.testMint(-25000, 85000, 5000)

        await conduit.setAccept(false)
        await expect(test.testBurnAmbient(1000)).to.be.reverted
        await expect(test.testBurn(-25000, 85000, 1000)).to.be.reverted
        
    })
})
