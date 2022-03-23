import { TestLevelBook } from '../typechain/TestLevelBook'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toFixedGrowth, fromFixedGrowth } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { TestKnockoutCounter } from '../typechain/TestKnockoutCounter';

chai.use(solidity);

describe('KnockoutBounter', () => {
    let test: TestKnockoutCounter
    const knockoutBits = 16 * 3 + 7 // Knockout params: 128 tick width no position restrictions

   beforeEach("deploy", async () => {
      const factory = await ethers.getContractFactory("TestKnockoutCounter");
      test = (await factory.deploy()) as TestKnockoutCounter;
    })

    it("mint position", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(501)
        expect(ask.askLots_).to.eq(501)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(85000)

        let pivot = await test.getPivot(35000, true, 800, 928)
        let callTime = await test.callTime_()
        expect(pivot.lots).to.eq(501)
        expect(pivot.pivotTime).to.eq(callTime)
        expect(pivot.range).to.eq(128)        

        let pos = await test.getPosition(35000, true, 800, 928, callTime)
        expect(pos.lots).to.eq(500)
        expect(pos.timestamp).to.eq(callTime)
        expect(pos.feeMileage).to.eq(0)
    })

    it("mint ask position", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, false, 800, 928)

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(501)
        expect(ask.askLots_).to.eq(501)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(85000)

        let pivot = await test.getPivot(35000, false, 800, 928)
        let callTime = await test.callTime_()
        expect(pivot.lots).to.eq(501)
        expect(pivot.pivotTime).to.eq(callTime)
        expect(pivot.range).to.eq(128)        

        let pos = await test.getPosition(35000, false, 800, 928, callTime)
        expect(pos.lots).to.eq(500)
        expect(pos.timestamp).to.eq(callTime)
        expect(pos.feeMileage).to.eq(0)
    })

    it("mint add pos", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await test.testMint(35000, knockoutBits, 900, 95000, 700, true, 800, 928)
        let callTime = await test.callTime_()

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(1201)
        expect(ask.askLots_).to.eq(1201)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(85000)

        let pivot = await test.getPivot(35000, true, 800, 928)
        expect(pivot.lots).to.eq(1201)
        expect(pivot.pivotTime).to.eq(pivotTime)
        expect(pivot.range).to.eq(128)        

        let pos = await test.getPosition(35000, true, 800, 928, pivotTime)
        expect(pos.lots).to.eq(1200)
        expect(pos.timestamp).to.eq(callTime)
        expect(pos.feeMileage).to.eq(5835) // Blended
    })

    it("mint pivot stack", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await test.setLockholder(128)
        await test.testMint(35000, knockoutBits, 900, 95000, 700, true, 800, 928)
        let callTime = await test.callTime_()

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(1201)
        expect(ask.askLots_).to.eq(1201)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(85000)

        let pivot = await test.getPivot(35000, true, 800, 928)
        expect(pivot.lots).to.eq(1201)
        expect(pivot.pivotTime).to.eq(pivotTime)
        expect(pivot.range).to.eq(128)        

        let pos = await test.getPosition(35000, true, 800, 928, pivotTime)
        expect(pos.lots).to.eq(700)
        expect(pos.timestamp).to.eq(callTime)
        expect(pos.feeMileage).to.eq(10000)
    })

    // Two knockout orders with same ticks but different direction should make two different pivots
    it("mint pivot arches", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await test.testMint(35000, knockoutBits, 900, 95000, 700, false, 800, 928)
        let pivotTime2 = await test.callTime_()

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(1202)
        expect(ask.askLots_).to.eq(1202)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(85000)

        let pivotBid = await test.getPivot(35000, true, 800, 928)
        expect(pivotBid.lots).to.eq(501)
        expect(pivotBid.pivotTime).to.eq(pivotTime)
        expect(pivotBid.range).to.eq(128)

        let pivotAsk = await test.getPivot(35000, false, 800, 928)
        expect(pivotAsk.lots).to.eq(701)
        expect(pivotAsk.pivotTime).to.eq(pivotTime2)
        expect(pivotAsk.range).to.eq(128)
    })
})