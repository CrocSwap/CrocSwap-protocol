import { TestLevelBook } from '../typechain/TestLevelBook'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toFixedGrowth, fromFixedGrowth } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";

chai.use(solidity);

describe('LevelBook tick Size', () => {
    let book: TestLevelBook

   beforeEach("deploy", async () => {
      const factory = await ethers.getContractFactory("TestLevelBook");
      book = (await factory.deploy()) as TestLevelBook;
    })

    it("zero tick size init", async() => {
        expect(await book.testGetTickSize()).to.equal(0);

        // No minimum tick increment: should mint position at variety of prices
        await book.testAdd(0, -1, 1, 5000, toFixedGrowth(0.5));
        await book.testAdd(0, -2, 2, 5000, toFixedGrowth(0.5));
        await book.testAdd(0, -3, 3, 5000, toFixedGrowth(0.5));
        await book.testAdd(0, -4, 4, 5000, toFixedGrowth(0.5));
    })

    it("tick increment", async() => {
        await book.testSetTickSize(65);
        expect(await book.testGetTickSize()).to.equal(65);

        // All of the below are off on one or both sides from the tick increment
        expect(book.testAdd(0, -7, 3, 5000, toFixedGrowth(0.5))).to.be.reverted
        expect(book.testAdd(0, -65, 3, 5000, toFixedGrowth(0.5))).to.be.reverted
        expect(book.testAdd(0, 6, 72, 5000, toFixedGrowth(0.5))).to.be.reverted
        expect(book.testAdd(0, 42, 130, 5000, toFixedGrowth(0.5))).to.be.reverted
        
        // All of the below land on the tick increment
        await book.testAdd(3, -65, 65, 5000, toFixedGrowth(0.5))
        await book.testAdd(3, 130, 260, 5000, toFixedGrowth(0.5))
        await book.testAdd(3, -260, -65, 5000, toFixedGrowth(0.5))
        await book.testAdd(0, 0, -650, 5000, toFixedGrowth(0.5))
    })

    it("tick burn post-change", async() => {        
        await book.testAdd(0, -10, 17, 5000, toFixedGrowth(0.5))
        await book.testSetTickSize(65);

        // Should be able to burn liuidity grandfathered in under previous tick regime.
        await book.testRemove(0, -10, 17, 3000, toFixedGrowth(0.5))
        await book.testRemove(0, -10, 17, 500, toFixedGrowth(0.5))
        expect(book.testAdd(0, -10, 17, 1000, toFixedGrowth(0.5))).to.be.reverted
    })

    it("tick cross post-change", async() => {        
        await book.testAdd(0, -10, 17, 5000, toFixedGrowth(0.5))
        await book.testSetTickSize(65);

        // Should be able to criss liuidity grandfathered in under previous tick regime.
        await book.testCrossLevel(-10, false, toFixedGrowth(0.6))
        await book.testCrossLevel(17, true, toFixedGrowth(0.7))
    })

    it("tick shrink back", async() => {
        await book.testSetTickSize(65);
        expect(book.testAdd(0, -10, 15, 5000, toFixedGrowth(0.5))).to.be.reverted

        await book.testSetTickSize(5);
        await book.testAdd(0, -10, 15, 5000, toFixedGrowth(0.5))
        expect(book.testAdd(0, 1, 3, 5000, toFixedGrowth(0.5))).to.be.reverted

        await book.testSetTickSize(0);
        await book.testAdd(0, 1, 3, 5000, toFixedGrowth(0.5))
    })

    it("tick sete invalid", async() => {
        expect(book.testSetTickSize(-1)).to.be.reverted
        expect(book.testSetTickSize(65536)).to.be.reverted
    })
})