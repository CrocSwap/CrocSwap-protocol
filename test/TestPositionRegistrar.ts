import { TestPositionRegistrar } from '../typechain/TestPositionRegistrar'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import chai from "chai";

chai.use(solidity);

describe('PositionRegistrar', () => {
    let reg: TestPositionRegistrar
    let owner = "0x9c8f005ab27AdB94f3d49020A15722Db2Fcd9F27"
    let ownerTwo = "0xFe5550377b3cF7cC14cafCC7Ee378D0B979718C2"

   beforeEach("deploy TestBitmapsLib", async () => {
      const factory = await ethers.getContractFactory("TestPositionRegistrar");
      reg = (await factory.deploy()) as TestPositionRegistrar;
   })

    it("empty init", async() => {
        let result = await reg.getPos(owner, 100, 110);
        expect(result[0].toNumber()).to.equal(0);
        expect(result[1].toNumber()).to.equal(0);
    })


    it("add liq", async() => {
        await reg.testAdd(owner, -100, 100, 250000, 12500);
        let result = await reg.getPos(owner, -100, 100);
        expect(result[0].toNumber()).to.equal(250000);
        expect(result[1].toNumber()).to.equal(12500);

        result = await reg.getPos(ownerTwo, -100, 100);
        expect(result[0].toNumber()).to.equal(0);
        
        result = await reg.getPos(owner, -101, 100);
        expect(result[0].toNumber()).to.equal(0);

        result = await reg.getPos(owner, -100, 101);
        expect(result[0].toNumber()).to.equal(0);
    })


    it("add stack", async() => {
        let mileageMean = (12500 * 275 + 17500 * 175) / (275 + 175)
        await reg.testAdd(owner, -100, 100, 250000, 12500);
        await reg.testAdd(owner, -100, 100, 25000, 12500);
        await reg.testAdd(owner, -100, 100, 175000, 17500);
        
        let result = await reg.getPos(owner, -100, 100);
        expect(result[0].toNumber()).to.equal(450000);
        expect(result[1].toNumber()).to.gt(mileageMean);
        expect(result[1].toNumber()).to.lte(mileageMean + 1);
    })

    it("add multi pos", async() => {
        await reg.testAdd(owner, -100, 100, 250000, 12500);
        await reg.testAdd(owner, -101, 100, 175000, 17500);
        await reg.testAdd(ownerTwo, -100, 100, 50000, 8500);
        
        let result = await reg.getPos(owner, -100, 100);
        expect(result[0].toNumber()).to.equal(250000);
        expect(result[1].toNumber()).to.equal(12500);

        result = await reg.getPos(owner, -101, 100);
        expect(result[0].toNumber()).to.equal(175000);
        expect(result[1].toNumber()).to.equal(17500);

        result = await reg.getPos(ownerTwo, -100, 100);
        expect(result[0].toNumber()).to.equal(50000);
        expect(result[1].toNumber()).to.equal(8500);
    })


    it("burn partial", async() => {
        await reg.testAdd(owner, -100, 100, 250000, 12500);
        await reg.testBurn(owner, -100, 100, 125000, 14500);
        await reg.testBurn(owner, -100, 100, 10000, 12800);
        let result = await reg.getPos(owner, -100, 100);
        expect(result[0].toNumber()).to.equal(115000);
        expect(result[1].toNumber()).to.equal(12500);
    })

    it("burn full", async() => {
        await reg.testAdd(owner, -100, 100, 250000, 12500);
        await reg.testBurn(owner, -100, 100, 100000, 13500);
        await reg.testBurn(owner, -100, 100, 150000, 12800);
        let result = await reg.getPos(owner, -100, 100);
        expect(result[0].toNumber()).to.equal(0);
        expect(result[1].toNumber()).to.equal(12500);
    })

    it("burn position only", async() => {
        await reg.testAdd(owner, -100, 100, 250000, 12500);
        await reg.testAdd(owner, -100, 99, 350000, 14500);
        await reg.testBurn(owner, -100, 100, 250000, 13500);
        let result = await reg.getPos(owner, -100, 99);
        expect(result[0].toNumber()).to.equal(350000);
        expect(result[1].toNumber()).to.equal(14500);
    })

    it("burn rewards", async() => {
        await reg.testAdd(owner, -100, 100, 250000, 12500);
        await reg.testBurn(owner, -100, 100, 10000, 13500);
        let rewardOne = await reg.lastRewards();
        await reg.testBurn(owner, -100, 100, 10000, 12500);
        let rewardTwo = await reg.lastRewards();
        await reg.testBurn(owner, -100, 100, 10000, 14800);
        let rewardThree = await reg.lastRewards();

        await reg.testAdd(owner, -100, 100, 220000, 16500);
        await reg.testBurn(owner, -100, 100, 10000, 20500);
        let rewardFour = await reg.lastRewards();

        expect(rewardOne.toNumber()).to.equal(1000);
        expect(rewardTwo.toNumber()).to.equal(0);
        expect(rewardThree.toNumber()).to.equal(2300);
        expect(rewardFour.toNumber()).to.lte(6000);
        expect(rewardFour.toNumber()).to.gte(6000-3);
    })

    it("transfer position", async() => {
        await reg.testAdd(owner, -100, 100, 250000, 12500);
        await reg.testTransfer(owner, ownerTwo, -100, 100);
        let resultPrev = await reg.getPos(owner, -100, 100)
        let result = await reg.getPos(ownerTwo, -100, 100)
        expect(resultPrev[0]).to.equal(0)
        expect(result[0]).to.equal(250000)
        expect(result[1]).to.equal(12500)
    })

    it("transfer collision", async() => {
        await reg.testAdd(owner, -100, 100, 250000, 12500);
        await reg.testAdd(ownerTwo, -100, 100, 250000, 12500);
        expect(reg.testTransfer(owner, ownerTwo, -100, 100)).to.be.reverted
    })

    it("set and get intermediate liq ratio", async() => {
        await reg.testSetItmdLiqRat(1);
        expect(await reg.testGetItmdLiqRat()).to.equal(1);
    })

    it("valid intermediate liq mint", async() => {
        await reg.testSetItmdLiqRat(100000);
        await reg.testAdd(owner, -6, 37, 10000, 100);
        let result = await reg.testValidItmdTickPos(owner, -6, 37, 1, false);
        expect(result[0]).to.equal(true);
    })

    it("valid intermediate liq burn", async() => {
        await reg.testSetItmdLiqRat(100000);
        await reg.testAdd(owner, -6, 37, 100, 100);
        let result = await reg.testValidItmdTickPos(owner, -6, 37, 1, true);
        expect(result[0]).to.equal(true);   
    })

    it("invalid intermediate liq mint", async() => {
        await reg.testSetItmdLiqRat(1);
        await reg.testAdd(owner, -6, 37, 1, 100);
        let result = await reg.testValidItmdTickPos(owner, -6, 37, 1, false);
        expect(result[0]).to.equal(false);
    })

    it("invalid intermediate liq burn", async() => {
        await reg.testSetItmdLiqRat(1);
        await reg.testAdd(owner, -6, 37, 5, 100);
        let result = await reg.testValidItmdTickPos(owner, -6, 37, 1, true);
        expect(result[0]).to.equal(false);
    })
})