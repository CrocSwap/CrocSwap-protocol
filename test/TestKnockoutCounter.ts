import { TestLevelBook } from '../typechain/TestLevelBook'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toFixedGrowth, fromFixedGrowth } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { TestKnockoutCounter } from '../typechain/TestKnockoutCounter';
import { BigNumber } from 'ethers';

chai.use(solidity);

describe('Knockout Counter Mixin', () => {
    let test: TestKnockoutCounter
    const knockoutBits = 16 * 3 + 7 // Knockout params: 128 tick width no position restrictions

   beforeEach("deploy", async () => {
      const factory = await ethers.getContractFactory("TestKnockoutCounter");
      test = (await factory.deploy()) as TestKnockoutCounter;
    })

    it("mint position", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)

        expect(await test.togglesPivot_()).to.be.true
        expect(await test.pivotTime_()).to.equal(await test.callTime_())

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(501) // Knockout flag marked
        expect(ask.askLots_).to.eq(500)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(85000)

        let pivot = await test.getPivot(35000, true, 800, 928)
        let callTime = await test.callTime_()
        expect(pivot.lots).to.eq(500)
        expect(pivot.pivotTime).to.eq(callTime)
        expect(pivot.range).to.eq(128)        

        let pos = await test.getPosition(35000, true, 800, 928, callTime)
        expect(pos.lots).to.eq(500)
        expect(pos.timestamp).to.eq(callTime)
        expect(pos.feeMileage).to.eq(0)
    })

    it("mint ask position", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, false, 800, 928)

        expect(await test.togglesPivot_()).to.be.true
        expect(await test.pivotTime_()).to.equal(await test.callTime_())

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(500)
        expect(ask.askLots_).to.eq(501) // Knockout flag marked
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(85000)

        let pivot = await test.getPivot(35000, false, 800, 928)
        let callTime = await test.callTime_()
        expect(pivot.lots).to.eq(500)
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

        expect(await test.togglesPivot_()).to.be.false
        expect(await test.pivotTime_()).to.equal(pivotTime)
        expect(await test.pivotTime_()).to.not.equal(callTime)

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(1201) // Knockout flag marked
        expect(ask.askLots_).to.eq(1200)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(85000)

        let pivot = await test.getPivot(35000, true, 800, 928)
        expect(pivot.lots).to.eq(1200)
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

        expect(await test.togglesPivot_()).to.be.false
        expect(await test.pivotTime_()).to.equal(pivotTime)
        expect(await test.pivotTime_()).to.not.equal(callTime)

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(1201) // Knockout flag marked 
        expect(ask.askLots_).to.eq(1200)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(85000)

        let pivot = await test.getPivot(35000, true, 800, 928)
        expect(pivot.lots).to.eq(1200)
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
        expect(bid.bidLots_).to.eq(1201)
        expect(ask.askLots_).to.eq(1201)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(85000)

        let pivotBid = await test.getPivot(35000, true, 800, 928)
        expect(pivotBid.lots).to.eq(500)
        expect(pivotBid.pivotTime).to.eq(pivotTime)
        expect(pivotBid.range).to.eq(128)

        let pivotAsk = await test.getPivot(35000, false, 800, 928)
        expect(pivotAsk.lots).to.eq(700)
        expect(pivotAsk.pivotTime).to.eq(pivotTime2)
        expect(pivotAsk.range).to.eq(128)
    })

    it("merkle slot pre-warmed", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)

        expect(await test.togglesPivot_()).to.be.true
        expect(await test.pivotTime_()).to.equal(await test.callTime_())

        let merkle = await test.getMerkle(35000, true, 800, 928)
        expect(merkle.root).to.not.eq(0)
    })

    it("burn partial", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await test.testBurn(35000, 900, 95000, 200, true, 800, 928)

        expect(await test.togglesPivot_()).to.be.false
        expect(await test.pivotTime_()).to.equal(pivotTime)
        expect(await test.rewards_()).to.equal(10000)

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(301) // Knockout flag marked
        expect(ask.askLots_).to.eq(300)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(85000)

        let pivot = await test.getPivot(35000, true, 800, 928)
        let callTime = await test.callTime_()
        expect(pivot.lots).to.eq(300)
        expect(pivot.pivotTime).to.eq(callTime)
        expect(pivot.range).to.eq(128)        

        let pos = await test.getPosition(35000, true, 800, 928, callTime)
        expect(pos.lots).to.eq(300)
        expect(pos.timestamp).to.eq(callTime)
        expect(pos.feeMileage).to.eq(0)
    })

    it("burn full", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await test.testBurn(35000, 900, 95000, 500, true, 800, 928)

        expect(await test.togglesPivot_()).to.be.true
        expect(await test.pivotTime_()).to.equal(pivotTime)
        expect(await test.rewards_()).to.equal(10000)

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(0)
        expect(ask.askLots_).to.eq(0)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(0)

        let pivot = await test.getPivot(35000, true, 800, 928)
        let callTime = await test.callTime_()
        expect(pivot.lots).to.eq(0)
        expect(pivot.pivotTime).to.eq(0)
        expect(pivot.range).to.eq(0)        

        let pos = await test.getPosition(35000, true, 800, 928, callTime)
        expect(pos.lots).to.eq(0)
        expect(pos.timestamp).to.eq(0)
        expect(pos.feeMileage).to.eq(0)
    })

    it("burn over", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await expect(test.testBurn(35000, 900, 95000, 501, true, 800, 928)).to.be.reverted
    })

    it("burn ask position", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, false, 800, 928)
        let pivotTime = await test.callTime_()
        await test.testBurn(35000, 900, 95000, 200, false, 800, 928)

        expect(await test.togglesPivot_()).to.be.false
        expect(await test.pivotTime_()).to.equal(pivotTime)
        expect(await test.rewards_()).to.equal(10000)

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(300)
        expect(ask.askLots_).to.eq(301) // Knockout flag marked
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(85000)

        let pivot = await test.getPivot(35000, false, 800, 928)
        let callTime = await test.callTime_()
        expect(pivot.lots).to.eq(300)
        expect(pivot.pivotTime).to.eq(callTime)
        expect(pivot.range).to.eq(128)        

        let pos = await test.getPosition(35000, false, 800, 928, callTime)
        expect(pos.lots).to.eq(300)
        expect(pos.timestamp).to.eq(callTime)
        expect(pos.feeMileage).to.eq(0)
    })

    it("burn bid/ask criss-cross", async() => {
        await test.testMintArch(35000, knockoutBits, 900, 85000, 500, 800, 928)
        let pivotTime = await test.callTime_()
        await test.testBurn(35000, 900, 115000, 500, true, 800, 928)
        
        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(500)
        expect(ask.askLots_).to.eq(501) // Knockout flag marked

        let pivot = await test.getPivot(35000, true, 800, 928)
        expect(pivot.lots).to.eq(0)

        pivot = await test.getPivot(35000, false, 800, 928)
        expect(pivot.lots).to.eq(500)

        let pos = await test.getPosition(35000, true, 800, 928, pivotTime)
        expect(pos.lots).to.eq(0)
        pos = await test.getPosition(35000, false, 800, 928, pivotTime)
        expect(pos.lots).to.eq(500)
    })

    it("burn add pos", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await test.testMint(35000, knockoutBits, 900, 95000, 700, true, 800, 928)
        let callTime = await test.callTime_()
        await test.testBurn(35000, 900, 115000, 800, true, 800, 928)

        expect(await test.togglesPivot_()).to.be.false
        expect(await test.pivotTime_()).to.equal(pivotTime)
        expect(await test.pivotTime_()).to.not.equal(callTime)

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(401) // Knockout flag marked
        expect(ask.askLots_).to.eq(400)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(85000)

        let pivot = await test.getPivot(35000, true, 800, 928)
        expect(pivot.lots).to.eq(400)
        expect(pivot.pivotTime).to.eq(pivotTime)

        let pos = await test.getPosition(35000, true, 800, 928, pivotTime)
        expect(pos.lots).to.eq(400)
        expect(pos.timestamp).to.eq(callTime)
        expect(pos.feeMileage).to.eq(5835) // Blended
    })

    it("burn pivot stack", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await test.setLockholder(128)
        await test.testMint(35000, knockoutBits, 900, 95000, 700, true, 800, 928)
        let callTime = await test.callTime_()
        await test.testBurn(35000, 900, 105000, 700, true, 800, 928)

        expect(await test.togglesPivot_()).to.be.false
        expect(await test.pivotTime_()).to.equal(pivotTime)
        expect(await test.rewards_()).to.equal(10000)

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(501) // Knockout flag marked 
        expect(ask.askLots_).to.eq(500)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(85000)

        let pivot = await test.getPivot(35000, true, 800, 928)
        expect(pivot.lots).to.eq(500)
        expect(pivot.pivotTime).to.eq(pivotTime)
        expect(pivot.range).to.eq(128)        

        let pos = await test.getPosition(35000, true, 800, 928, pivotTime)
        expect(pos.lots).to.eq(0)
        expect(pos.timestamp).to.eq(0)
        expect(pos.feeMileage).to.eq(0)
    })

    it("cross position", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        await test.testCross(35000, true, 800, 125000)

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(0)
        expect(ask.askLots_).to.eq(0)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(0)

        let pivot = await test.getPivot(35000, true, 800, 928)
        let callTime = await test.callTime_()
        expect(pivot.lots).to.eq(0)
        expect(pivot.pivotTime).to.eq(0)
        expect(pivot.range).to.eq(0)        

        let merkle = await test.getMerkle(35000, true, 800, 928)
        expect(merkle.pivotTime).to.eq(await test.callTime_())
        expect(merkle.feeMileage).to.eq(40000)

        let pos = await test.getPosition(35000, true, 800, 928, callTime)
        expect(pos.lots).to.eq(500)
        expect(pos.timestamp).to.eq(callTime)
        expect(pos.feeMileage).to.eq(0)
    })

    it("cross position sell", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, false, 800, 928)
        await test.testCross(35000, false, 928, 125000)

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(0)
        expect(ask.askLots_).to.eq(0)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(0)

        let pivot = await test.getPivot(35000, false, 800, 928)
        let callTime = await test.callTime_()
        expect(pivot.lots).to.eq(0)
        expect(pivot.pivotTime).to.eq(0)
        expect(pivot.range).to.eq(0)        

        let merkle = await test.getMerkle(35000, false, 800, 928)
        expect(merkle.pivotTime).to.eq(await test.callTime_())
        expect(merkle.feeMileage).to.eq(40000)

        let pos = await test.getPosition(35000, false, 800, 928, callTime)
        expect(pos.lots).to.eq(500)
        expect(pos.timestamp).to.eq(callTime)
        expect(pos.feeMileage).to.eq(0)
    })

    it("cross multiple", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let timeOne = await test.callTime_()
        await test.testCross(35000, true, 800, 125000)
        await test.testCross(35000, false, 800, 135000)
        await test.testMint(35000, knockoutBits, 900, 155000, 800, true, 800, 928)
        let timeTwo = await test.callTime_()
        expect(timeOne).not.eq(timeTwo)

        let bid = await test.getLevelState(35000, 800)
        let ask = await test.getLevelState(35000, 928)
        expect(bid.bidLots_).to.eq(801)
        expect(ask.askLots_).to.eq(800)
        expect(bid.askLots_).to.eq(0)
        expect(ask.bidLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)
        expect(ask.feeOdometer_).to.eq(155000)

        let pivot = await test.getPivot(35000, true, 800, 928)
        expect(pivot.lots).to.eq(800)
        expect(pivot.pivotTime).to.eq(timeTwo)
        expect(pivot.range).to.eq(128)        

        let merkle = await test.getMerkle(35000, true, 800, 928)
        expect(merkle.pivotTime).to.eq(timeOne)
        expect(merkle.feeMileage).to.eq(40000)

        let pos = await test.getPosition(35000, true, 800, 928, timeOne)
        expect(pos.lots).to.eq(500)
        expect(pos.timestamp).to.eq(timeOne)
        expect(pos.feeMileage).to.eq(0)

        // Second pivot
        pos = await test.getPosition(35000, true, 800, 928, timeTwo)
        expect(pos.lots).to.eq(800)
        expect(pos.timestamp).to.eq(timeTwo)
        expect(pos.feeMileage).to.eq(0)

        // Knockout second pivot
        await test.testCross(35000, true, 800, 175000)

        merkle = await test.getMerkle(35000, true, 800, 928)
        expect(merkle.pivotTime).to.eq(timeTwo)
        expect(merkle.feeMileage).to.eq(20000)

        pos = await test.getPosition(35000, true, 800, 928, timeTwo)
        expect(pos.lots).to.eq(800)
        expect(pos.timestamp).to.eq(timeTwo)
        expect(pos.feeMileage).to.eq(0)

        bid = await test.getLevelState(35000, 800)
        expect(bid.bidLots_).to.eq(0)
        expect(bid.askLots_).to.eq(0)
        expect(bid.feeOdometer_).to.eq(0)

        pivot = await test.getPivot(35000, true, 800, 928)
        expect(pivot.lots).to.eq(0)
        expect(pivot.pivotTime).to.eq(0)
        expect(pivot.range).to.eq(0)        
    })

    function formProof (pivots: number[], mileages: number[]): BigNumber[] {
        let proofs: BigNumber[] = []
        for (let i = 0; i < pivots.length; ++i) {
            proofs.push(BigNumber.from(pivots[i]).shl(64).add(BigNumber.from(mileages[i])))
        }
        return proofs
    }

    it("claim position", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await test.testCross(35000, true, 800, 125000)
        await test.testClaim(35000, true, 800, 928, 1, formProof([], []))

        expect(await test.bookLots_()).to.eq(500)
        expect(await test.rewards_()).to.eq(40000)        

        // Position should be cleared
        let pos = await test.getPosition(35000, true, 800, 928, pivotTime)
        expect(pos.lots).to.eq(0)
        expect(pos.timestamp).to.eq(0)
        expect(pos.feeMileage).to.eq(0)
    })

    it("claim multiple pos", async() => {
        await test.setLockholder(128)
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await test.setLockholder(256)
        await test.testMint(35000, knockoutBits, 900, 85000, 350, true, 800, 928)

        await test.testCross(35000, true, 800, 125000)
        await test.testClaim(35000, true, 800, 928, 1, formProof([], []))

        expect(await test.bookLots_()).to.eq(350)
        expect(await test.rewards_()).to.eq(40000)        

        // Position should be cleared
        let pos = await test.getPosition(35000, true, 800, 928, pivotTime)
        expect(pos.lots).to.eq(0)
        expect(pos.timestamp).to.eq(0)

        await test.setLockholder(128)
        pos = await test.getPosition(35000, true, 800, 928, pivotTime)
        expect(pos.lots).to.eq(500)
        expect(pos.timestamp).to.eq(pivotTime)
    })

    it("claim stack", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await test.testCross(35000, true, 800, 125000)
        await test.testCross(35000, false, 800, 135000)
        let rootOne = (await test.getMerkle(35000, true, 800, 928)).root

        await test.testMint(35000, knockoutBits, 900, 140000, 600, true, 800, 928)
        let pivotTimeTwo = await test.callTime_()
        await test.testCross(35000, true, 800, 155000)
        await test.testCross(35000, false, 800, 165000)
        let rootTwo = (await test.getMerkle(35000, true, 800, 928)).root

        await test.testMint(35000, knockoutBits, 900, 225000, 700, true, 800, 928)
        let pivotTimeThree = await test.callTime_()
        await test.testCross(35000, true, 800, 225000)
        await test.testCross(35000, false, 800, 240000)

        await test.testClaim(35000, true, 800, 928, rootOne, formProof([pivotTime, pivotTimeTwo], [40000, 15000]))
        expect(await test.bookLots_()).to.eq(500)
        expect(await test.rewards_()).to.eq(40000)        

        // Position should be cleared
        let pos = await test.getPosition(35000, true, 800, 928, pivotTime)
        expect(pos.lots).to.eq(0)
        expect(pos.timestamp).to.eq(0)
        expect(pos.feeMileage).to.eq(0)

        // Unclaimed position should be open
        pos = await test.getPosition(35000, true, 800, 928, pivotTimeTwo)
        expect(pos.lots).to.eq(600)

        // Claim second pivot
        await test.testClaim(35000, true, 800, 928, rootTwo, formProof([pivotTimeTwo], [15000]))
        expect(await test.bookLots_()).to.eq(600)
        expect(await test.rewards_()).to.eq(15000)        

        // Position should be cleared
        pos = await test.getPosition(35000, true, 800, 928, pivotTimeTwo)
        expect(pos.lots).to.eq(0)
    })

    it("claim before knockout", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()

        expect(test.testClaim(35000, true, 800, 928, 1, formProof([], [])))
        expect(await test.bookLots_()).to.eq(0) 
    })

    it("burn after knockout", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await test.testCross(35000, true, 800, 125000)
        await test.testClaim(35000, true, 800, 928, 1, formProof([], []))

        expect(await test.bookLots_()).to.eq(500)
        expect(await test.rewards_()).to.eq(40000)        

        // Position should be cleared
        let pos = await test.getPosition(35000, true, 800, 928, pivotTime)
        expect(pos.lots).to.eq(0)
        expect(pos.timestamp).to.eq(0)
        expect(pos.feeMileage).to.eq(0)
    })

    it("bad claim proofs", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await test.testCross(35000, true, 800, 125000)
        await test.testCross(35000, false, 800, 135000)
        let rootOne = (await test.getMerkle(35000, true, 800, 928)).root

        await test.testMint(35000, knockoutBits, 900, 140000, 600, true, 800, 928)
        let pivotTimeTwo = await test.callTime_()
        await test.testCross(35000, true, 800, 155000)
        await test.testCross(35000, false, 800, 165000)
        let rootTwo = (await test.getMerkle(35000, true, 800, 928)).root

        await test.testMint(35000, knockoutBits, 900, 225000, 700, true, 800, 928)
        let pivotTimeThree = await test.callTime_()
        await test.testCross(35000, true, 800, 225000)
        await test.testCross(35000, false, 800, 240000)

        // Bad proofs...
        await expect(test.testClaim(35000, true, 800, 928, rootOne, formProof([pivotTime, pivotTimeTwo], [45000, 15000]))).to.be.reverted
        await expect(test.testClaim(35000, true, 800, 928, rootOne, formProof([pivotTime+1, pivotTimeTwo], [40000, 15000]))).to.be.reverted
        await expect(test.testClaim(35000, true, 800, 928, rootTwo, formProof([pivotTime, pivotTimeTwo], [40000, 15000]))).to.be.reverted

        // Proofs at wrong pivot
        await expect(test.testClaim(36000, true, 800, 928, rootOne, formProof([pivotTime, pivotTimeTwo], [40000, 15000]))).to.be.reverted
        await expect(test.testClaim(35000, false, 800, 928, rootOne, formProof([pivotTime, pivotTimeTwo], [40000, 15000]))).to.be.reverted
        await expect(test.testClaim(35000, true, 700, 828, rootOne, formProof([pivotTime, pivotTimeTwo], [40000, 15000]))).to.be.reverted

        // User without claim on pivot... gets zero lots
        await test.setLockholder(128)
        expect(test.testClaim(35000, true, 800, 928, rootOne, formProof([pivotTime, pivotTimeTwo], [40000, 15000])))
        expect(await test.bookLots_()).to.eq(0)
        expect(await test.rewards_()).to.eq(40000)     

        // Non-claimed user's position should be still be there
        await test.setLockholder(0)
        let pos = await test.getPosition(35000, true, 800, 928, pivotTime)
        expect(pos.lots).to.eq(500)
    })

    it("recover", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await test.testCross(35000, true, 800, 125000)
        await test.testCross(35000, false, 800, 135000)
        let rootOne = (await test.getMerkle(35000, true, 800, 928)).root

        await test.testMint(35000, knockoutBits, 900, 140000, 600, true, 800, 928)
        let pivotTimeTwo = await test.callTime_()
        await test.testCross(35000, true, 800, 155000)
        await test.testCross(35000, false, 800, 165000)
        let rootTwo = (await test.getMerkle(35000, true, 800, 928)).root

        await test.testMint(35000, knockoutBits, 900, 225000, 700, true, 800, 928)
        let pivotTimeThree = await test.callTime_()
        await test.testCross(35000, true, 800, 225000)
        await test.testCross(35000, false, 800, 240000)

        await test.testRecover(35000, true, 800, 928, pivotTime)
        expect(await test.bookLots_()).to.eq(500)

        // Position should be cleared
        let pos = await test.getPosition(35000, true, 800, 928, pivotTime)
        expect(pos.lots).to.eq(0)
        expect(pos.timestamp).to.eq(0)
        expect(pos.feeMileage).to.eq(0)

        // Unclaimed position should be open
        pos = await test.getPosition(35000, true, 800, 928, pivotTimeTwo)
        expect(pos.lots).to.eq(600)

        // Claim second pivot
        await test.testRecover(35000, true, 800, 928, pivotTimeTwo)
        expect(await test.bookLots_()).to.eq(600)

        // Position should be cleared
        pos = await test.getPosition(35000, true, 800, 928, pivotTimeTwo)
        expect(pos.lots).to.eq(0)

        // Claim last pivot
        await test.testRecover(35000, true, 800, 928, pivotTimeThree)
        expect(await test.bookLots_()).to.eq(700)
    })

    it("bad recovers", async() => {
        await test.testMint(35000, knockoutBits, 900, 85000, 500, true, 800, 928)
        let pivotTime = await test.callTime_()
        await test.testCross(35000, true, 800, 125000)
        await test.testCross(35000, false, 800, 135000)
        let rootOne = (await test.getMerkle(35000, true, 800, 928)).root

        await test.testMint(35000, knockoutBits, 900, 140000, 600, true, 800, 928)
        let pivotTimeTwo = await test.callTime_()
        await test.testCross(35000, true, 800, 155000)
        await test.testCross(35000, false, 800, 165000)
        let rootTwo = (await test.getMerkle(35000, true, 800, 928)).root

        await test.testMint(35000, knockoutBits, 900, 225000, 700, true, 800, 928)
        let pivotTimeThree = await test.callTime_()
        await test.testCross(35000, true, 800, 225000)
        await test.testCross(35000, false, 800, 240000)

        await test.testMint(35000, knockoutBits, 900, 225000, 700, true, 800, 928)
        let pivotTimeFour = await test.callTime_()
        
        // Attempt to recover a non-knocked out pivot
        await expect(test.testRecover(35000, true, 800, 928, pivotTimeFour)).to.be.reverted

        // Non-existence pivot time returns zero
        await test.testRecover(35000, true, 800, 928, pivotTime+1)
        expect(await test.bookLots_()).to.eq(0)

        // Right pivot but no position returns zero
        await test.setLockholder(128)
        await test.testRecover(35000, true, 800, 928, pivotTime)
        expect(await test.bookLots_()).to.eq(0)
    })
})