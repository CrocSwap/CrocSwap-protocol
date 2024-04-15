import { TestLevelBook } from '../typechain/TestLevelBook'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toFixedGrowth, fromFixedGrowth } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { TestLevelBook72Bit } from '../typechain';

chai.use(solidity);

describe('LevelBook', () => {
    let book: TestLevelBook

   beforeEach("deploy", async () => {
      const factory = await ethers.getContractFactory("TestLevelBook");
      book = (await factory.deploy()) as TestLevelBook;
   })

    it("empty init", async() => {
        let lvl = await book.getLevelState(0, 100);
        expect(lvl.askLots_.toNumber()).to.equal(0);
        expect(lvl.bidLots_.toNumber()).to.equal(0);
        expect(lvl.feeOdometer_.toNumber()).to.equal(0);

        lvl = await book.getLevelState(0, 100);
        expect(lvl.askLots_.toNumber()).to.equal(0);
        expect(lvl.bidLots_.toNumber()).to.equal(0);
        expect(lvl.feeOdometer_.toNumber()).to.equal(0);
    })

    it("add fresh liq", async() => {
        await book.testAdd(0, 100, 95, 105, 10000, toFixedGrowth(0.5))
        let bid = await book.getLevelState(0, 95);
        let ask = await book.getLevelState(0, 105);
        let mid = await book.getLevelState(0, 100);
        let alt = await book.getLevelState(1, 95);
        expect(bid.bidLots_.toNumber()).to.equal(10000);
        expect(bid.askLots_.toNumber()).to.equal(0);
        expect(ask.bidLots_.toNumber()).to.equal(0);
        expect(ask.askLots_.toNumber()).to.equal(10000);
        expect(mid.bidLots_.toNumber()).to.equal(0);
        expect(mid.bidLots_.toNumber()).to.equal(0);
        expect(alt.bidLots_.toNumber()).to.equal(0);
        expect(alt.bidLots_.toNumber()).to.equal(0);
    })

    it("stack liq", async() => {
        await book.testAdd(1, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 95, 110, 20000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 90, 105, 33000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 90, 95, 50000, toFixedGrowth(0.5))
        let bid = await book.getLevelState(1, 95);
        let ask = await book.getLevelState(1, 105);
        expect(bid.bidLots_.toNumber()).to.equal(30000);
        expect(bid.askLots_.toNumber()).to.equal(50000);
        expect(ask.bidLots_.toNumber()).to.equal(0);
        expect(ask.askLots_.toNumber()).to.equal(43000);
    })

    it("add above", async() => {
        await book.testAdd(3, 50, 95, 105, 10000, toFixedGrowth(0.5))
        let bid = await book.getLevelState(3, 95);
        let ask = await book.getLevelState(3, 105);
        expect(bid.bidLots_.toNumber()).to.equal(10000);
        expect(bid.askLots_.toNumber()).to.equal(0);
        expect(ask.bidLots_.toNumber()).to.equal(0);
        expect(ask.askLots_.toNumber()).to.equal(10000);
    })

    it("add below", async() => {
        await book.testAdd(0, 150, 95, 105, 10000, toFixedGrowth(0.5))
        let bid = await book.getLevelState(0, 95);
        let ask = await book.getLevelState(0, 105);
        expect(bid.bidLots_.toNumber()).to.equal(10000);
        expect(bid.askLots_.toNumber()).to.equal(0);
        expect(ask.bidLots_.toNumber()).to.equal(0);
        expect(ask.askLots_.toNumber()).to.equal(10000);
    })

    it("remove partial", async() => {
        await book.testAdd(2, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(2, 100, 95, 110, 20000, toFixedGrowth(0.5))
        await book.testRemove(2, 100, 95, 105, 3000, toFixedGrowth(0.5))
        await book.testRemove(2, 100, 95, 110, 5000, toFixedGrowth(0.5))
        let bid = await book.getLevelState(2, 95);
        let ask = await book.getLevelState(2, 105);
        let ask2 = await book.getLevelState(2, 110);
        expect(bid.bidLots_.toNumber()).to.equal(22000);
        expect(bid.askLots_.toNumber()).to.equal(0);
        expect(ask.bidLots_.toNumber()).to.equal(0);
        expect(ask.askLots_.toNumber()).to.equal(7000);
        expect(ask2.askLots_.toNumber()).to.equal(15000);
    })

    it("remove full", async() => {
        await book.testAdd(0, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(0, 100, 95, 110, 20000, toFixedGrowth(0.5))
        await book.testRemove(0, 100, 95, 105, 10000, toFixedGrowth(0.5))
        let bid = await book.getLevelState(0, 95);
        let ask = await book.getLevelState(0, 105);
        expect(bid.bidLots_.toNumber()).to.equal(20000);
        expect(bid.askLots_.toNumber()).to.equal(0);
        expect(ask.bidLots_.toNumber()).to.equal(0);
        expect(ask.askLots_.toNumber()).to.equal(0);
    })

    it("remove over", async() => {
        await book.testAdd(2, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(2, 100, 95, 110, 20000, toFixedGrowth(0.5))
        expect(book.testRemove(2, 100, 95, 105, 11000, toFixedGrowth(0.5))).to.be.reverted;
    })
    
    it("bookmark ticks", async() => {
        await book.testAdd(1, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 95, 110, 20000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 90, 105, 33000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 90, 95, 50000, toFixedGrowth(0.5))

        expect(await book.hasTickBump(1, 90)).to.equal(true)
        expect(await book.hasTickBump(1, 94)).to.equal(false)
        expect(await book.hasTickBump(0, 95)).to.equal(false)
        expect(await book.hasTickBump(1, 95)).to.equal(true)
        expect(await book.hasTickBump(1, 100)).to.equal(false)
        expect(await book.hasTickBump(1, 105)).to.equal(true)
        expect(await book.hasTickBump(1, 110)).to.equal(true)
        expect(await book.hasTickBump(2, 110)).to.equal(false)
        expect(await book.hasTickBump(1, 500)).to.equal(false)
    })

    it("forget ticks", async() => {
        await book.testAdd(3, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(3, 100, 95, 110, 20000, toFixedGrowth(0.5))
        await book.testAdd(3, 100, 90, 105, 33000, toFixedGrowth(0.5))
        await book.testAdd(3, 100, 90, 95, 50000, toFixedGrowth(0.5))
        await book.testAdd(0, 100, 90, 110, 8000, toFixedGrowth(0.5))

        await book.testRemove(3, 100, 95, 110, 12000, toFixedGrowth(0.5))
        expect(await book.hasTickBump(3, 90)).to.equal(true)
        expect(await book.hasTickBump(3, 95)).to.equal(true)
        expect(await book.hasTickBump(3, 105)).to.equal(true)
        expect(await book.hasTickBump(3, 110)).to.equal(true)
        expect(await book.hasTickBump(0, 110)).to.equal(true)
        
        await book.testRemove(3, 100, 95, 110, 8000, toFixedGrowth(0.5))
        expect(await book.hasTickBump(3, 90)).to.equal(true)
        expect(await book.hasTickBump(3, 95)).to.equal(true)
        expect(await book.hasTickBump(3, 105)).to.equal(true)
        expect(await book.hasTickBump(3, 110)).to.equal(false)
        expect(await book.hasTickBump(0, 110)).to.equal(true)

        await book.testRemove(3, 100, 95, 105, 10000, toFixedGrowth(0.5))
        expect(await book.hasTickBump(3, 90)).to.equal(true)
        expect(await book.hasTickBump(3, 95)).to.equal(true)
        expect(await book.hasTickBump(3, 105)).to.equal(true)
        expect(await book.hasTickBump(3, 110)).to.equal(false)
        expect(await book.hasTickBump(0, 110)).to.equal(true)

        await book.testRemove(3, 100, 90, 105, 33000, toFixedGrowth(0.5))
        expect(await book.hasTickBump(3, 90)).to.equal(true)
        expect(await book.hasTickBump(3, 95)).to.equal(true)
        expect(await book.hasTickBump(3, 105)).to.equal(false)
        expect(await book.hasTickBump(3, 110)).to.equal(false)
        expect(await book.hasTickBump(0, 110)).to.equal(true)

        await book.testRemove(3, 100, 90, 95, 50000, toFixedGrowth(0.5))
        expect(await book.hasTickBump(3, 90)).to.equal(false)
        expect(await book.hasTickBump(3, 95)).to.equal(false)
        expect(await book.hasTickBump(3, 105)).to.equal(false)
        expect(await book.hasTickBump(3, 110)).to.equal(false)
        expect(await book.hasTickBump(0, 110)).to.equal(true)
    })

    it("cross level liq", async() => {
        await book.testAdd(1, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 90, 95, 25000, toFixedGrowth(0.5))
        await book.testAdd(2, 100, 90, 95, 35000, toFixedGrowth(0.8))
        
        await book.testCrossLevel(1, 95, true, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(-15000*1024)

        await book.testCrossLevel(1, 95, false, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(15000*1024)
        
        await book.testCrossLevel(1, 90, false, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(-25000*1024)

        await book.testCrossLevel(1, 90, true, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(25000*1024)

        await book.testCrossLevel(1, 105, false, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(10000*1024)

        await book.testCrossLevel(1, 106, false, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(0)

        await book.testCrossLevel(2, 95, true, toFixedGrowth(0.8))
        expect((await book.liqDelta()).toNumber()).to.equal(-35000*1024)
    })

    // Test that we can safely cross non-initialized levels without breaking the
    // tick bitmap or screwing up liquidity.
    it("cross non level", async() => {
        await book.testAdd(1, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 90, 95, 25000, toFixedGrowth(0.5))
        
        await book.testCrossLevel(1, 98, false, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(0)
        await book.testCrossLevel(1, 98, true, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(0)
        expect(await book.hasTickBump(1, 98)).to.equal(false)

        await book.testAdd(1, 100, 98, 102, 25000, toFixedGrowth(0.5))
        expect(await book.hasTickBump(1, 98)).to.equal(true)
        await book.testCrossLevel(1, 98, false, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(-25000*1024)        
        await book.testCrossLevel(1, 98, true, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(25000*1024)        
        expect(await book.hasTickBump(1, 98)).to.equal(true)

        // Differnt pool
        await book.testCrossLevel(0, 95, false, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(0)        
    })

    it("odometer add", async() => {
        await book.testAdd(0, 100, 95, 105, 10000, toFixedGrowth(0.5))
        let start = await book.odometer()
        await book.testAdd(0, 100, 95, 105, 10000, toFixedGrowth(0.75))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.25)
    })

    it("odometer remove partial", async() => {
        await book.testAdd(1, 100, 95, 105, 10000, toFixedGrowth(0.5))
        let start = await book.odometer()
        await book.testRemove(1, 100, 95, 105, 5000, toFixedGrowth(0.75))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.25)
    })

    it("odometer remove full", async() => {
        await book.testAdd(2, 100, 95, 105, 10000, toFixedGrowth(0.5))
        let start = await book.odometer()
        await book.testRemove(2, 100, 95, 105, 10000, toFixedGrowth(0.75))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.25)
    })

    it("odometer add/rmove sequence", async() => {
        await book.testAdd(2, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testRemove(2, 100, 95, 105, 10000, toFixedGrowth(0.75))
        await book.testAdd(2, 100, 95, 105, 10000, toFixedGrowth(1.25))
        await book.testAdd(2, 100, 95, 105, 10000, toFixedGrowth(1.5))
        await book.testRemove(2, 100, 95, 105, 10000, toFixedGrowth(1.75))
        await book.testRemove(2, 100, 95, 105, 3000, toFixedGrowth(2.5))
        let start = await book.odometer()
        await book.testAdd(2, 100, 95, 105, 3000, toFixedGrowth(3.25))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.75)
    })

    it("above re-clock", async() => {
        await book.testAdd(3, 110, 95, 105, 10000, toFixedGrowth(0.5))
        let start = await book.odometer()
        await book.testAdd(3, 110, 95, 105, 10000, toFixedGrowth(0.75))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0)
    })

    it("odometer boundary", async() => {
        await book.testAdd(4, 95, 95, 105, 10000, toFixedGrowth(0.5))
        let start = await book.odometer()
        await book.testAdd(4, 95, 95, 105, 10000, toFixedGrowth(0.75))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.25)

        await book.testAdd(4, 105, 95, 105, 10000, toFixedGrowth(0.5))
        start = await book.odometer()
        await book.testAdd(4, 105, 95, 105, 10000, toFixedGrowth(0.75))
        end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0)
    })

    // Levels may be initialized with zero global fee accumulation. It's tempting to use
    // use zero odometer as an initialization condition, but this may not be the case for these
    // levels. Verify that we don't erroneously re-initialize in these cases.
    it("odometer zero init", async() => {
        await book.testAdd(1, 100, 95, 105, 10000, toFixedGrowth(0))
        let start = await book.odometer()
        await book.testAdd(1, 100, 95, 105, 10000, toFixedGrowth(0.75))
        let end = await book.odometer()        
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.75)
    })

    it("below re-clock", async() => {
        await book.testAdd(2, 110, 95, 105, 10000, toFixedGrowth(0.5))
        let start = await book.odometer()
        await book.testAdd(2, 110, 95, 105, 10000, toFixedGrowth(0.75))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0)
    })

    it("cross fee", async() => {
        await book.testAdd(2, 100, 95, 105, 10000, toFixedGrowth(0.5))
        let startOne = await book.odometer()
        await book.testAdd(2, 100, 93, 98, 10000, toFixedGrowth(0.5))        
        let startTwo = await book.odometer()
        await book.testAdd(0, 100, 93, 98, 10000, toFixedGrowth(0.8))        
        let startAlt = await book.odometer()

        await book.testCrossLevel(2, 98, false, toFixedGrowth(0.75))
        await book.testCrossLevel(2, 95, false, toFixedGrowth(1.0))
        await book.testCrossLevel(0, 98, false, toFixedGrowth(1.25))

        await book.testRemove(2, 94, 95, 105, 5000, toFixedGrowth(2.25))
        let endOne = await book.odometer()
        await book.testRemove(2, 94, 93, 98, 5000, toFixedGrowth(2.375))        
        let endTwo = await book.odometer()
        await book.testRemove(0, 94, 93, 98, 5000, toFixedGrowth(2.75))        
        let endAlt = await book.odometer()

        expect(fromFixedGrowth(endOne.sub(startOne))).to.equal(0.5)
        expect(fromFixedGrowth(endTwo.sub(startTwo))).to.equal(1.625)
        expect(fromFixedGrowth(endAlt.sub(startAlt))).to.equal(1.5)
    })

    it("cross up", async() => {
        await book.testAdd(2, 94, 95, 105, 10000, toFixedGrowth(0.5))
        let startOne = await book.odometer()
        await book.testAdd(2, 94, 93, 98, 10000, toFixedGrowth(0.5))        
        let startTwo = await book.odometer()

        await book.testCrossLevel(2, 95, true, toFixedGrowth(0.75))
        await book.testCrossLevel(2, 98, true, toFixedGrowth(1.25))
        await book.testCrossLevel(2, 105, true, toFixedGrowth(2.25))

        await book.testRemove(2, 105, 95, 105, 5000, toFixedGrowth(4.5))
        let endOne = await book.odometer()
        await book.testRemove(2, 105, 93, 98, 5000, toFixedGrowth(4.75))        
        let endTwo = await book.odometer()

        expect(fromFixedGrowth(endOne.sub(startOne))).to.equal(1.5)
        expect(fromFixedGrowth(endTwo.sub(startTwo))).to.equal(0.75)
    })

    it("cross sequence", async() => {
        await book.testAdd(2, 98, 95, 105, 10000, toFixedGrowth(0.5))
        let start = await book.odometer()

        await book.testCrossLevel(2, 95, false, toFixedGrowth(0.75))
        await book.testCrossLevel(2, 95, true, toFixedGrowth(1.25))
        await book.testRemove(2, 100, 95, 105, 1000, toFixedGrowth(1.5))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.25 + 0.25)
        
        await book.testCrossLevel(2, 105, true, toFixedGrowth(2.0))
        await book.testCrossLevel(2, 105, false, toFixedGrowth(3.25))
        await book.testRemove(2, 100, 95, 105, 1000, toFixedGrowth(3.5))
        end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.25 + 0.25 + 0.75)

        await book.testCrossLevel(2, 95, false, toFixedGrowth(5.75))
        await book.testCrossLevel(2, 95, true, toFixedGrowth(6.75))
        await book.testRemove(2, 100, 95, 105, 1000, toFixedGrowth(8.25))
        end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(1.5 + 0.25 + 0.75 + 2.5)
        
        await book.testCrossLevel(2, 105, true, toFixedGrowth(16.5))
        await book.testCrossLevel(2, 105, false, toFixedGrowth(17.5))
        await book.testCrossLevel(2, 105, true, toFixedGrowth(28.75))

        await book.testRemove(2, 107, 95, 105, 5000, toFixedGrowth(48.5))
        end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(3.5 + + 9.75 + 11.25)        
    })
})

describe('LevelBook 72 bit', () => {
    let book: TestLevelBook72Bit

   beforeEach("deploy", async () => {
      const factory = await ethers.getContractFactory("TestLevelBook72Bit");
      book = (await factory.deploy()) as TestLevelBook72Bit;
   })

    it("empty init", async() => {
        let lvl = await book.getLevelState(0, 100);
        expect(lvl.askLots_.toNumber()).to.equal(0);
        expect(lvl.bidLots_.toNumber()).to.equal(0);
        expect(lvl.feeOdometer_.toNumber()).to.equal(0);

        lvl = await book.getLevelState(0, 100);
        expect(lvl.askLots_.toNumber()).to.equal(0);
        expect(lvl.bidLots_.toNumber()).to.equal(0);
        expect(lvl.feeOdometer_.toNumber()).to.equal(0);
    })

    it("add fresh liq", async() => {
        await book.testAdd(0, 100, 95, 105, 10000, toFixedGrowth(0.5))
        let bid = await book.getLevelState(0, 95);
        let ask = await book.getLevelState(0, 105);
        let mid = await book.getLevelState(0, 100);
        let alt = await book.getLevelState(1, 95);
        expect(bid.bidLots_.toNumber()).to.equal(10000);
        expect(bid.askLots_.toNumber()).to.equal(0);
        expect(ask.bidLots_.toNumber()).to.equal(0);
        expect(ask.askLots_.toNumber()).to.equal(10000);
        expect(mid.bidLots_.toNumber()).to.equal(0);
        expect(mid.bidLots_.toNumber()).to.equal(0);
        expect(alt.bidLots_.toNumber()).to.equal(0);
        expect(alt.bidLots_.toNumber()).to.equal(0);
    })

    it("stack liq", async() => {
        await book.testAdd(1, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 95, 110, 20000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 90, 105, 33000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 90, 95, 50000, toFixedGrowth(0.5))
        let bid = await book.getLevelState(1, 95);
        let ask = await book.getLevelState(1, 105);
        expect(bid.bidLots_.toNumber()).to.equal(30000);
        expect(bid.askLots_.toNumber()).to.equal(50000);
        expect(ask.bidLots_.toNumber()).to.equal(0);
        expect(ask.askLots_.toNumber()).to.equal(43000);
    })

    it("add above", async() => {
        await book.testAdd(3, 50, 95, 105, 10000, toFixedGrowth(0.5))
        let bid = await book.getLevelState(3, 95);
        let ask = await book.getLevelState(3, 105);
        expect(bid.bidLots_.toNumber()).to.equal(10000);
        expect(bid.askLots_.toNumber()).to.equal(0);
        expect(ask.bidLots_.toNumber()).to.equal(0);
        expect(ask.askLots_.toNumber()).to.equal(10000);
    })

    it("add below", async() => {
        await book.testAdd(0, 150, 95, 105, 10000, toFixedGrowth(0.5))
        let bid = await book.getLevelState(0, 95);
        let ask = await book.getLevelState(0, 105);
        expect(bid.bidLots_.toNumber()).to.equal(10000);
        expect(bid.askLots_.toNumber()).to.equal(0);
        expect(ask.bidLots_.toNumber()).to.equal(0);
        expect(ask.askLots_.toNumber()).to.equal(10000);
    })

    it("remove partial", async() => {
        await book.testAdd(2, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(2, 100, 95, 110, 20000, toFixedGrowth(0.5))
        await book.testRemove(2, 100, 95, 105, 3000, toFixedGrowth(0.5))
        await book.testRemove(2, 100, 95, 110, 5000, toFixedGrowth(0.5))
        let bid = await book.getLevelState(2, 95);
        let ask = await book.getLevelState(2, 105);
        let ask2 = await book.getLevelState(2, 110);
        expect(bid.bidLots_.toNumber()).to.equal(22000);
        expect(bid.askLots_.toNumber()).to.equal(0);
        expect(ask.bidLots_.toNumber()).to.equal(0);
        expect(ask.askLots_.toNumber()).to.equal(7000);
        expect(ask2.askLots_.toNumber()).to.equal(15000);
    })

    it("remove full", async() => {
        await book.testAdd(0, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(0, 100, 95, 110, 20000, toFixedGrowth(0.5))
        await book.testRemove(0, 100, 95, 105, 10000, toFixedGrowth(0.5))
        let bid = await book.getLevelState(0, 95);
        let ask = await book.getLevelState(0, 105);
        expect(bid.bidLots_.toNumber()).to.equal(20000);
        expect(bid.askLots_.toNumber()).to.equal(0);
        expect(ask.bidLots_.toNumber()).to.equal(0);
        expect(ask.askLots_.toNumber()).to.equal(0);
    })

    it("remove over", async() => {
        await book.testAdd(2, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(2, 100, 95, 110, 20000, toFixedGrowth(0.5))
        expect(book.testRemove(2, 100, 95, 105, 11000, toFixedGrowth(0.5))).to.be.reverted;
    })
    
    it("bookmark ticks", async() => {
        await book.testAdd(1, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 95, 110, 20000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 90, 105, 33000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 90, 95, 50000, toFixedGrowth(0.5))

        expect(await book.hasTickBump(1, 90)).to.equal(true)
        expect(await book.hasTickBump(1, 94)).to.equal(false)
        expect(await book.hasTickBump(0, 95)).to.equal(false)
        expect(await book.hasTickBump(1, 95)).to.equal(true)
        expect(await book.hasTickBump(1, 100)).to.equal(false)
        expect(await book.hasTickBump(1, 105)).to.equal(true)
        expect(await book.hasTickBump(1, 110)).to.equal(true)
        expect(await book.hasTickBump(2, 110)).to.equal(false)
        expect(await book.hasTickBump(1, 500)).to.equal(false)
    })

    it("forget ticks", async() => {
        await book.testAdd(3, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(3, 100, 95, 110, 20000, toFixedGrowth(0.5))
        await book.testAdd(3, 100, 90, 105, 33000, toFixedGrowth(0.5))
        await book.testAdd(3, 100, 90, 95, 50000, toFixedGrowth(0.5))
        await book.testAdd(0, 100, 90, 110, 8000, toFixedGrowth(0.5))

        await book.testRemove(3, 100, 95, 110, 12000, toFixedGrowth(0.5))
        expect(await book.hasTickBump(3, 90)).to.equal(true)
        expect(await book.hasTickBump(3, 95)).to.equal(true)
        expect(await book.hasTickBump(3, 105)).to.equal(true)
        expect(await book.hasTickBump(3, 110)).to.equal(true)
        expect(await book.hasTickBump(0, 110)).to.equal(true)
        
        await book.testRemove(3, 100, 95, 110, 8000, toFixedGrowth(0.5))
        expect(await book.hasTickBump(3, 90)).to.equal(true)
        expect(await book.hasTickBump(3, 95)).to.equal(true)
        expect(await book.hasTickBump(3, 105)).to.equal(true)
        expect(await book.hasTickBump(3, 110)).to.equal(false)
        expect(await book.hasTickBump(0, 110)).to.equal(true)

        await book.testRemove(3, 100, 95, 105, 10000, toFixedGrowth(0.5))
        expect(await book.hasTickBump(3, 90)).to.equal(true)
        expect(await book.hasTickBump(3, 95)).to.equal(true)
        expect(await book.hasTickBump(3, 105)).to.equal(true)
        expect(await book.hasTickBump(3, 110)).to.equal(false)
        expect(await book.hasTickBump(0, 110)).to.equal(true)

        await book.testRemove(3, 100, 90, 105, 33000, toFixedGrowth(0.5))
        expect(await book.hasTickBump(3, 90)).to.equal(true)
        expect(await book.hasTickBump(3, 95)).to.equal(true)
        expect(await book.hasTickBump(3, 105)).to.equal(false)
        expect(await book.hasTickBump(3, 110)).to.equal(false)
        expect(await book.hasTickBump(0, 110)).to.equal(true)

        await book.testRemove(3, 100, 90, 95, 50000, toFixedGrowth(0.5))
        expect(await book.hasTickBump(3, 90)).to.equal(false)
        expect(await book.hasTickBump(3, 95)).to.equal(false)
        expect(await book.hasTickBump(3, 105)).to.equal(false)
        expect(await book.hasTickBump(3, 110)).to.equal(false)
        expect(await book.hasTickBump(0, 110)).to.equal(true)
    })

    it("cross level liq", async() => {
        await book.testAdd(1, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 90, 95, 25000, toFixedGrowth(0.5))
        await book.testAdd(2, 100, 90, 95, 35000, toFixedGrowth(0.8))
        
        await book.testCrossLevel(1, 95, true, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(-15000*1024)

        await book.testCrossLevel(1, 95, false, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(15000*1024)
        
        await book.testCrossLevel(1, 90, false, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(-25000*1024)

        await book.testCrossLevel(1, 90, true, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(25000*1024)

        await book.testCrossLevel(1, 105, false, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(10000*1024)

        await book.testCrossLevel(1, 106, false, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(0)

        await book.testCrossLevel(2, 95, true, toFixedGrowth(0.8))
        expect((await book.liqDelta()).toNumber()).to.equal(-35000*1024)
    })

    // Test that we can safely cross non-initialized levels without breaking the
    // tick bitmap or screwing up liquidity.
    it("cross non level", async() => {
        await book.testAdd(1, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testAdd(1, 100, 90, 95, 25000, toFixedGrowth(0.5))
        
        await book.testCrossLevel(1, 98, false, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(0)
        await book.testCrossLevel(1, 98, true, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(0)
        expect(await book.hasTickBump(1, 98)).to.equal(false)

        await book.testAdd(1, 100, 98, 102, 25000, toFixedGrowth(0.5))
        expect(await book.hasTickBump(1, 98)).to.equal(true)
        await book.testCrossLevel(1, 98, false, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(-25000*1024)        
        await book.testCrossLevel(1, 98, true, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(25000*1024)        
        expect(await book.hasTickBump(1, 98)).to.equal(true)

        // Differnt pool
        await book.testCrossLevel(0, 95, false, toFixedGrowth(0.5))
        expect((await book.liqDelta()).toNumber()).to.equal(0)        
    })

    it("odometer add", async() => {
        await book.testAdd(0, 100, 95, 105, 10000, toFixedGrowth(0.5))
        let start = await book.odometer()
        await book.testAdd(0, 100, 95, 105, 10000, toFixedGrowth(0.75))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.25)
    })

    it("odometer remove partial", async() => {
        await book.testAdd(1, 100, 95, 105, 10000, toFixedGrowth(0.5))
        let start = await book.odometer()
        await book.testRemove(1, 100, 95, 105, 5000, toFixedGrowth(0.75))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.25)
    })

    it("odometer remove full", async() => {
        await book.testAdd(2, 100, 95, 105, 10000, toFixedGrowth(0.5))
        let start = await book.odometer()
        await book.testRemove(2, 100, 95, 105, 10000, toFixedGrowth(0.75))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.25)
    })

    it("odometer add/rmove sequence", async() => {
        await book.testAdd(2, 100, 95, 105, 10000, toFixedGrowth(0.5))
        await book.testRemove(2, 100, 95, 105, 10000, toFixedGrowth(0.75))
        await book.testAdd(2, 100, 95, 105, 10000, toFixedGrowth(1.25))
        await book.testAdd(2, 100, 95, 105, 10000, toFixedGrowth(1.5))
        await book.testRemove(2, 100, 95, 105, 10000, toFixedGrowth(1.75))
        await book.testRemove(2, 100, 95, 105, 3000, toFixedGrowth(2.5))
        let start = await book.odometer()
        await book.testAdd(2, 100, 95, 105, 3000, toFixedGrowth(3.25))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.75)
    })

    it("above re-clock", async() => {
        await book.testAdd(3, 110, 95, 105, 10000, toFixedGrowth(0.5))
        let start = await book.odometer()
        await book.testAdd(3, 110, 95, 105, 10000, toFixedGrowth(0.75))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0)
    })

    it("odometer boundary", async() => {
        await book.testAdd(4, 95, 95, 105, 10000, toFixedGrowth(0.5))
        let start = await book.odometer()
        await book.testAdd(4, 95, 95, 105, 10000, toFixedGrowth(0.75))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.25)

        await book.testAdd(4, 105, 95, 105, 10000, toFixedGrowth(0.5))
        start = await book.odometer()
        await book.testAdd(4, 105, 95, 105, 10000, toFixedGrowth(0.75))
        end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0)
    })

    // Levels may be initialized with zero global fee accumulation. It's tempting to use
    // use zero odometer as an initialization condition, but this may not be the case for these
    // levels. Verify that we don't erroneously re-initialize in these cases.
    it("odometer zero init", async() => {
        await book.testAdd(1, 100, 95, 105, 10000, toFixedGrowth(0))
        let start = await book.odometer()
        await book.testAdd(1, 100, 95, 105, 10000, toFixedGrowth(0.75))
        let end = await book.odometer()        
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.75)
    })

    it("below re-clock", async() => {
        await book.testAdd(2, 110, 95, 105, 10000, toFixedGrowth(0.5))
        let start = await book.odometer()
        await book.testAdd(2, 110, 95, 105, 10000, toFixedGrowth(0.75))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0)
    })

    it("cross fee", async() => {
        await book.testAdd(2, 100, 95, 105, 10000, toFixedGrowth(0.5))
        let startOne = await book.odometer()
        await book.testAdd(2, 100, 93, 98, 10000, toFixedGrowth(0.5))        
        let startTwo = await book.odometer()
        await book.testAdd(0, 100, 93, 98, 10000, toFixedGrowth(0.8))        
        let startAlt = await book.odometer()

        await book.testCrossLevel(2, 98, false, toFixedGrowth(0.75))
        await book.testCrossLevel(2, 95, false, toFixedGrowth(1.0))
        await book.testCrossLevel(0, 98, false, toFixedGrowth(1.25))

        await book.testRemove(2, 94, 95, 105, 5000, toFixedGrowth(2.25))
        let endOne = await book.odometer()
        await book.testRemove(2, 94, 93, 98, 5000, toFixedGrowth(2.375))        
        let endTwo = await book.odometer()
        await book.testRemove(0, 94, 93, 98, 5000, toFixedGrowth(2.75))        
        let endAlt = await book.odometer()

        expect(fromFixedGrowth(endOne.sub(startOne))).to.equal(0.5)
        expect(fromFixedGrowth(endTwo.sub(startTwo))).to.equal(1.625)
        expect(fromFixedGrowth(endAlt.sub(startAlt))).to.equal(1.5)
    })

    it("cross up", async() => {
        await book.testAdd(2, 94, 95, 105, 10000, toFixedGrowth(0.5))
        let startOne = await book.odometer()
        await book.testAdd(2, 94, 93, 98, 10000, toFixedGrowth(0.5))        
        let startTwo = await book.odometer()

        await book.testCrossLevel(2, 95, true, toFixedGrowth(0.75))
        await book.testCrossLevel(2, 98, true, toFixedGrowth(1.25))
        await book.testCrossLevel(2, 105, true, toFixedGrowth(2.25))

        await book.testRemove(2, 105, 95, 105, 5000, toFixedGrowth(4.5))
        let endOne = await book.odometer()
        await book.testRemove(2, 105, 93, 98, 5000, toFixedGrowth(4.75))        
        let endTwo = await book.odometer()

        expect(fromFixedGrowth(endOne.sub(startOne))).to.equal(1.5)
        expect(fromFixedGrowth(endTwo.sub(startTwo))).to.equal(0.75)
    })

    it("cross sequence", async() => {
        await book.testAdd(2, 98, 95, 105, 10000, toFixedGrowth(0.5))
        let start = await book.odometer()

        await book.testCrossLevel(2, 95, false, toFixedGrowth(0.75))
        await book.testCrossLevel(2, 95, true, toFixedGrowth(1.25))
        await book.testRemove(2, 100, 95, 105, 1000, toFixedGrowth(1.5))
        let end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.25 + 0.25)
        
        await book.testCrossLevel(2, 105, true, toFixedGrowth(2.0))
        await book.testCrossLevel(2, 105, false, toFixedGrowth(3.25))
        await book.testRemove(2, 100, 95, 105, 1000, toFixedGrowth(3.5))
        end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(0.25 + 0.25 + 0.75)

        await book.testCrossLevel(2, 95, false, toFixedGrowth(5.75))
        await book.testCrossLevel(2, 95, true, toFixedGrowth(6.75))
        await book.testRemove(2, 100, 95, 105, 1000, toFixedGrowth(8.25))
        end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(1.5 + 0.25 + 0.75 + 2.5)
        
        await book.testCrossLevel(2, 105, true, toFixedGrowth(16.5))
        await book.testCrossLevel(2, 105, false, toFixedGrowth(17.5))
        await book.testCrossLevel(2, 105, true, toFixedGrowth(28.75))

        await book.testRemove(2, 107, 95, 105, 5000, toFixedGrowth(48.5))
        end = await book.odometer()
        expect(fromFixedGrowth(end.sub(start))).to.equal(3.5 + + 9.75 + 11.25)        
    })
})