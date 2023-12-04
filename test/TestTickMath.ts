import { TestTickMath } from '../typechain/TestTickMath';
import { expect } from "chai";
import chai from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import { toFixedGrowth, toSqrtPrice, fromSqrtPrice } from './FixedPoint';

chai.use(solidity);

describe('Tick Math', () => {
    let math: TestTickMath

    beforeEach("deploy", async () => {
        const libFactory = await ethers.getContractFactory("TestTickMath");
        math = (await libFactory.deploy()) as TestTickMath
    })

    it ("tick to ratio", async() => {
        let ratioOne = await math.testRatio(0)
        let ratioBumpUp = await math.testRatio(1)
        let ratioBumpDown = await math.testRatio(-1)
        let ratioLow = await math.testRatio(-25000)
        let ratioHigh = await math.testRatio(25000)        
        expect(ratioOne).to.equal(toSqrtPrice(1.0))
        expect(ratioBumpUp).to.gt(toSqrtPrice(1.0001-1e-8))
        expect(ratioBumpUp).to.lt(toSqrtPrice(1.0001+1e-8))
        expect(ratioBumpDown).to.gt(toSqrtPrice(1/1.0001-1e-8))
        expect(ratioBumpDown).to.lt(toSqrtPrice(1/1.0001+1e-8))
        expect(ratioLow).to.gt(toSqrtPrice(0.08209526-1e-8))
        expect(ratioLow).to.lt(toSqrtPrice(0.08209526+1e-8))
        expect(ratioHigh).to.gt(toSqrtPrice(12.18097-1e-5))
        expect(ratioHigh).to.lt(toSqrtPrice(12.18097+1e-5))
    })

    it ("ratio to tick", async() => {
        let tickOne = await math.testTick(toSqrtPrice(1.0))
        let tickLow = await math.testTick(toSqrtPrice(0.08209526))
        let tickHigh = await math.testTick(toSqrtPrice(12.18097))
        expect(tickOne).to.equal(0)
        expect(tickLow).to.equal(-25001)
        expect(tickHigh).to.equal(24999)
    })

    it ("tick boundary", async() => {
        let ratioOne = await math.testRatio(0)
        let tickOne = await math.testTick(ratioOne)
        let tickPlusOne = await math.testTick(ratioOne.add(1))
        let tickMinusOne = await math.testTick(ratioOne.sub(1))        

        expect(tickOne).to.equal(0)
        expect(tickPlusOne).to.equal(0)
        expect(tickMinusOne).to.equal(-1)
    })

    it("min tick", async() => {
        let ratio = await math.testRatio(await math.minTick())
        expect(ratio).to.equal(await math.minRatio())

        let tick = await math.testTick(await math.minRatio())
        expect(tick).to.equal(await math.minTick())
    })

    it("max tick", async() => {
        let ratio = await math.testRatio(await math.maxTick())
        expect(ratio).to.equal(await math.maxRatio())

        let tick = await math.testTick((await math.maxRatio()).sub(1))
        expect(tick).to.equal(await math.maxTick() - 1)
    })

    it ("outside bounds", async() => {
        expect(math.testTick((await math.minRatio()).sub(1))).to.be.reverted
        expect(math.testTick((await math.maxRatio()))).to.be.reverted
        expect(math.testRatio((await math.minTick() - 1))).to.be.reverted
        expect(math.testRatio((await math.maxTick() + 1))).to.be.reverted
    })
})