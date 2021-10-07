import { TestPriceImprove } from '../typechain/TestPriceImprove';
import { expect } from "chai";
import chai from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import { toFixedGrowth, toSqrtPrice, fromSqrtPrice } from './FixedPoint';

chai.use(solidity);

describe('Price Improve', () => {
    let test: TestPriceImprove

    beforeEach("deploy", async () => {
        const libFactory = await ethers.getContractFactory("TestPriceImprove");
        test = (await libFactory.deploy()) as TestPriceImprove
    })

    const UP_MULTS = [3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8, 9]

    /*it ("ticks out of order", async() => {
        await expect(test.testThresh(true, 1024*1024, 500, UP_MULTS, 16, 0, 5, 5))
            .to.be.reverted
        await expect(test.testThresh(true, 1024*1024, 500, UP_MULTS, 16, 0, 5, -5))
            .to.be.reverted
        await expect(test.testThresh(true, 1024*1024, 500, UP_MULTS, 16, 0, 5, 4))
            .to.be.reverted
    })

    it ("array length", async() => {
        await expect(test.testThresh(true, 1024*1024, 500, UP_MULTS.slice(1), 16, 0, -5, 5))
            .to.be.reverted
        await expect(test.testThresh(true, 1024*1024, 500, UP_MULTS.concat([1]), 16, 0, -5, 5))
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
            .to.equal(822600768)

        // Unit price should be midway between, and almost identical between base and quote
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 0, 1, 2))
            .to.equal(40958976)
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 0, 1, 2))
            .to.equal(40958976)
    })

    const scaled = 
        [40958976,           // Base
            61436928,        // 3X over 2 ticks
            10238976,        // 1X over 4 ticks
            27302570,        // 4X over 6 ticks
            5118976,         // 1X over 8 ticks
            17061546,        // 5X over 12 ticks
            2558976,         // 1X over 16 ticks
            10233856,        // 6X over 24 ticks
            1278976,        // 1X over 32 ticks
            7160834,        // 7X over 40 ticks
            852308,        // 1X over 48 ticks
            5111812,        // 8X over 64 ticks
            425642,        // 1X over 96 ticks
            3677192]        // 9X over 100 ticks (100 is arbitrary but used in test)

    /*it("scale thresh", async() => {
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+1))
            .to.equal(scaled[0])
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+2))
            .to.equal(scaled[1])
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+4))
            .to.equal(scaled[2])
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+6))
            .to.equal(scaled[3])
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+8))
            .to.equal(scaled[4])
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+12))
            .to.equal(scaled[5])
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+16))
            .to.equal(scaled[6])
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+24))
            .to.equal(scaled[7])
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+32))
            .to.equal(scaled[8])
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+40))
            .to.equal(scaled[9])
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+48))
            .to.equal(scaled[10])
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+64))
            .to.equal(scaled[11])
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+96))
            .to.equal(scaled[12])
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+100))
            .to.equal(scaled[13])
    })

    it("scale thresh between", async() => {
        // Should map to the 12 mult, then requires 12/9 liquidity to match collateral
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+9))
            .to.equal(22750436)
        // Should map to the 12 mult, with 12/11 liquidity to match collateral
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 1, 1+11))
            .to.equal(18613062)
    })*/

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

    it("grid pin bid wings multiple sides", async() => {
        // Two 4 mults with 50% discounted, so maps close to the 4 mult.
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, -132, -124))
            .to.equal(10305227)
        expect(await test.testThresh(true, 1024, 5000, UP_MULTS, 128, 128, 1020, 2052))
            .to.equal(9485725)

        // 8 mult and and a 4 mult
        expect(await test.testThresh(true, 1024, 5000, UP_MULTS, 128, 128, 1016, 2052))
            .to.equal(7053371)

        // 6 mult and 14/16 mult (wing
        expect(await test.testThresh(true, 1024, 500, UP_MULTS, 128, 128, 250, 270))
            .to.equal(14925198)

    })
})