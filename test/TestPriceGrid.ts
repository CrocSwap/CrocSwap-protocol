import { TestPriceGrid } from '../typechain/TestPriceGrid';
import { expect } from "chai";
import chai from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import { toFixedGrowth, toSqrtPrice, fromSqrtPrice } from './FixedPoint';

chai.use(solidity);

describe('Price Improve', () => {
    let test: TestPriceGrid

    beforeEach("deploy", async () => {
        const libFactory = await ethers.getContractFactory("TestPriceGrid");
        test = (await libFactory.deploy()) as TestPriceGrid
    })

    const UP_MULTS = [3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8, 9]

    it ("ticks out of order", async() => {
        await expect(test.testThresh(true, 1024*1024, 500, UP_MULTS, 16, 0, 5, 5))
            .to.be.reverted
        await expect(test.testThresh(true, 1024*1024, 500, UP_MULTS, 16, 0, 5, -5))
            .to.be.reverted
        await expect(test.testThresh(true, 1024*1024, 500, UP_MULTS, 16, 0, 5, 4))
            .to.be.reverted
    })

    it ("non-improvable", async() => {
        expect(await test.testThresh(true, 0, 500, UP_MULTS, 16, 0, -5, 5))
            .to.gt(1000000000000)
        expect(await test.testThresh(true, 1024*1024, 10, UP_MULTS, 16, 100, 87, 101))
            .to.gt(1000000000000)
        expect(await test.testThresh(true, 1024*1024, 10, UP_MULTS, 16, 0, -11, 8))
            .to.gt(1000000000000)
        expect(await test.testThresh(true, 1024*1024, 10, UP_MULTS, 16, 100, 90, 110))
            .to.lt(1000000000000)
    })

    it("clip inside positive", async() => {
        expect(await test.testClipInside(128, 50, 60)).to.equal(10)
        expect(await test.testClipInside(128, 1, 2)).to.equal(1)
        expect(await test.testClipInside(128, 50, 1000)).to.equal(0)
        expect(await test.testClipInside(128, 0, 5)).to.equal(0)
        expect(await test.testClipInside(128, 120, 128)).to.equal(0)
        expect(await test.testClipInside(128, 128, 130)).to.equal(0)
        expect(await test.testClipInside(128, 120, 127)).to.equal(7)
        expect(await test.testClipInside(128, 129, 159)).to.equal(30)
    })

    it("clip inside negative", async() => {
        expect(await test.testClipInside(128, -60, -50)).to.equal(10)
        expect(await test.testClipInside(128, -12, -2)).to.equal(10)
        expect(await test.testClipInside(128, -1000, -50)).to.equal(0)
        expect(await test.testClipInside(128, -5, 0)).to.equal(0)
        expect(await test.testClipInside(128, -128, -120)).to.equal(0)
        expect(await test.testClipInside(128, -130, -128)).to.equal(0)
        expect(await test.testClipInside(128, -127, -120)).to.equal(7)
        expect(await test.testClipInside(128, -159, -129)).to.equal(30)
    })

    it("clip inside over zero", async() => {
        expect(await test.testClipInside(128, -5, 5)).to.equal(0)
        expect(await test.testClipInside(128, -200, 5)).to.equal(0)
        expect(await test.testClipInside(128, -5,  200)).to.equal(0)
        expect(await test.testClipInside(128, -5,  0)).to.equal(0)
        expect(await test.testClipInside(128, 0, 5)).to.equal(0)
        expect(await test.testClipInside(128, -200,  0)).to.equal(0)
        expect(await test.testClipInside(128, 0, 200)).to.equal(0)
    })

    it("clip below", async() => {
        expect(await test.testClipBelow(128, 100)).to.equal(28)
        expect(await test.testClipBelow(128, 1000)).to.equal(24)
        expect(await test.testClipBelow(128, 0)).to.equal(0)
        expect(await test.testClipBelow(128, -100)).to.equal(100)
        expect(await test.testClipBelow(128, -270)).to.equal(14)
        expect(await test.testClipBelow(128, 1024)).to.equal(0)
        expect(await test.testClipBelow(128, -512)).to.equal(0)
    })

    it("clip above", async() => {
        expect(await test.testClipAbove(128, 100)).to.equal(100)
        expect(await test.testClipAbove(128, 300)).to.equal(44)
        expect(await test.testClipAbove(128, 0)).to.equal(0)
        expect(await test.testClipAbove(128, -100)).to.equal(28)
        expect(await test.testClipAbove(128, -1000)).to.equal(24)
        expect(await test.testClipAbove(128, 1024)).to.equal(0)
        expect(await test.testClipAbove(128, -512)).to.equal(0)
    })

    it("unit tick", async() => {
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 60025, 60000, 60001))
            .to.equal(2039634)
        // Should be twice as high (with some rounding adjustments)
        expect(await test.testThresh(true, 2*1024, 500, UP_MULTS, 128, 60025, 60000, 60001))
            .to.equal(4079270)

        // Inverted price. Same base collateral requirements on lower price should require more
        // pool-specific liquidity. 
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, -60025, -60001, -60000))
            .to.equal(822641896)
        expect(await test.testThresh(true, 2*1024, 500, UP_MULTS, 128, -60025, -60001, -60000))
            .to.equal(1645283794)

        // In quote for a high price ratio, should be lower liquidity to meet collateral threshold.
        // Should be very close to the inverted price (but not exact due to numerics).
        expect(await test.testThresh(false, 1024, 500, UP_MULTS, 128, 60025, 60000, 60001))
            .to.equal(822641896)

        // Unit price should be midway between, and almost identical between base and quote
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 0, 1, 2))
            .to.equal(40958976)
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 0, 1, 2))
            .to.equal(40958976)
    })

    const scaled = 40958976

    it("scale thresh", async() => {
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+1))
            .to.equal(scaled)
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+6))
            .to.equal(6825642)
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+36))
            .to.equal(1136754)
    })

    it("grid pin ask wings", async() => {
        // Should map to the 4 mult, discounted by 50% for being on grid 
        // with minor adustments depending on pricing
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 0, 4))
            .to.equal(5118720)
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 256, 260))
            .to.equal(5053621)
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, -256, -252))
            .to.equal(5184657)
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, -128, 260))
            .to.equal(5053621)
    })

    it("grid pin bid wings", async() => {
        // Should map to the 4 mult, discounted by 50% for being on grid 
        // with minor adustments depending on pricing
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, -4, 0))
            .to.equal(5120768)
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 252, 256))
            .to.equal(5055643)
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, -260, -256))
            .to.equal(5186731)
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, -132, 512))
            .to.equal(5153644)
    })

    it("grid pin wings both sides", async() => {
        // Two 4 mults with 50% discounted, so maps close to the 4 mult.
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, -132, -124))
            .to.equal(10305227)
        expect(await test.testThresh(true, 1024, 5000, UP_MULTS, 128, 128, 1020, 2052))
            .to.equal(9485725)

        // 8 mult and and a 4 mult
        expect(await test.testThresh(true, 1024, 5000, UP_MULTS, 128, 128, 1016, 2052))
            .to.equal(7053371)

        // 6 mult and a 4 mult
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 250, 270))
            .to.equal(4813406)
    })

    it("on grid", async() => {
        expect(await test.testOnGrid(0, 128, 16)).to.equal(true)
        expect(await test.testOnGrid(0, 128, 128)).to.equal(true)
        expect(await test.testOnGrid(16, 96, 16)).to.equal(true)
        expect(await test.testOnGrid(30, 3090, 30)).to.equal(true)
        expect(await test.testOnGrid(29, 3090, 30)).to.equal(false)                
        expect(await test.testOnGrid(30, 3091, 30)).to.equal(false)
        expect(await test.testOnGrid(-128, 0, 16)).to.equal(true)
        expect(await test.testOnGrid(-127, 0, 16)).to.equal(false)
        expect(await test.testOnGrid(-256, -32, 32)).to.equal(true)        
        expect(await test.testOnGrid(-256, -32, 30)).to.equal(false)        
        expect(await test.testOnGrid(-256, -32, 64)).to.equal(false)       
        expect(await test.testOnGrid(32, 512, 64)).to.equal(false)       
        expect(await test.testOnGrid(32, 512, 8)).to.equal(true)       
    })

    it("verify", async() => {
        // Meets threshold
        await test.testVerify(true, 1024, 5000, UP_MULTS, 128, 128, 1016, 2052,
            true, 7053371)
        // Exceeds threshold
        await test.testVerify(true, 1024, 5000, UP_MULTS, 128, 128, 1016, 2052,
            true, 171053371)
        // Not adding, therefore threshold doesn't apply
        await test.testVerify(true, 1024, 5000, UP_MULTS, 128, 128, 1016, 2052,
            false, 1024)
        // On grid, threshold doesn't apply
        await test.testVerify(true, 1024, 5000, UP_MULTS, 128, 128, 1024, 2048,
            true, 1024)

        // Just below threshold
        await expect(test.testVerify(true, 1024, 5000, UP_MULTS, 128, 128, 1016, 2052,
                true, 7053370)).to.be.reverted
        // Well below threshold
        await expect(test.testVerify(true, 1024, 5000, UP_MULTS, 128, 128, 1016, 2052,
                true, 1024)).to.be.reverted

        // Off grid one side
        await expect(test.testVerify(true, 1024, 5000, UP_MULTS, 128, 128, 1025, 2048,
                true, 1024)).to.be.reverted
        await expect(test.testVerify(true, 1024, 5000, UP_MULTS, 128, 128, 1024, 2040,
                true, 1024)).to.be.reverted

        // Market too far away for price improvement
        await expect(test.testVerify(true, 1024, 500, UP_MULTS, 128, 128, 1016, 2052,
                true, 1117053371)).to.be.reverted

        // Zero collateral threshold treated as price improvement disabled
        await expect(test.testVerify(true, 0, 500, UP_MULTS, 128, 128, 1016, 2052,
                true, 1117053371)).to.be.reverted
    })
})