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
        let result = await reg.getPos(owner, 0, 100, 110);
        expect(result[0].toNumber()).to.equal(0);
        expect(result[1].toNumber()).to.equal(0);

        result = await reg.getPos(owner, 3, 95, 100);
        expect(result[0].toNumber()).to.equal(0);
        expect(result[1].toNumber()).to.equal(0);
    })


    it("add liq", async() => {
        await reg.testAdd(owner, 0, -100, 100, 250000, 12500);
        let result = await reg.getPos(owner, 0, -100, 100);
        expect(result[0].toNumber()).to.equal(250000);
        expect(result[1].toNumber()).to.equal(12500);

        result = await reg.getPos(ownerTwo, 0, -100, 100);
        expect(result[0].toNumber()).to.equal(0);
        
        result = await reg.getPos(owner, 0, -101, 100);
        expect(result[0].toNumber()).to.equal(0);

        result = await reg.getPos(owner, 0, -100, 101);
        expect(result[0].toNumber()).to.equal(0);

        result = await reg.getPos(owner, 2, -100, 101);
        expect(result[0].toNumber()).to.equal(0);
    })


    it("add stack", async() => {
        let mileageMean = (12500 * 275 + 17500 * 175) / (275 + 175)
        await reg.testAdd(owner, 0, -100, 100, 250000, 12500);
        await reg.testAdd(owner, 0, -100, 100, 25000, 12500);
        await reg.testAdd(owner, 0, -100, 100, 175000, 17500);
        
        let result = await reg.getPos(owner, 0, -100, 100);
        expect(result[0].toNumber()).to.equal(450000);
        expect(result[1].toNumber()).to.gt(mileageMean);
        expect(result[1].toNumber()).to.lte(mileageMean + 1);
    })

    it("add multi pos", async() => {
        await reg.testAdd(owner, 0, -100, 100, 250000, 12500);
        await reg.testAdd(owner, 0, -101, 100, 175000, 17500);
        await reg.testAdd(owner, 5, -101, 100, 185000, 19000);
        await reg.testAdd(ownerTwo, 0, -100, 100, 50000, 8500);
        
        let result = await reg.getPos(owner, 0, -100, 100);
        expect(result[0].toNumber()).to.equal(250000);
        expect(result[1].toNumber()).to.equal(12500);

        result = await reg.getPos(owner, 0, -101, 100);
        expect(result[0].toNumber()).to.equal(175000);
        expect(result[1].toNumber()).to.equal(17500);

        result = await reg.getPos(owner, 5, -101, 100);
        expect(result[0].toNumber()).to.equal(185000);
        expect(result[1].toNumber()).to.equal(19000);

        result = await reg.getPos(ownerTwo, 0, -100, 100);
        expect(result[0].toNumber()).to.equal(50000);
        expect(result[1].toNumber()).to.equal(8500);
    })


    it("burn partial", async() => {
        await reg.testAdd(owner, 3, -100, 100, 250000, 12500);
        await reg.testBurn(owner, 3, -100, 100, 125000, 14500);
        await reg.testBurn(owner, 3, -100, 100, 10000, 12800);
        let result = await reg.getPos(owner, 3, -100, 100);
        expect(result[0].toNumber()).to.equal(115000);
        expect(result[1].toNumber()).to.equal(12500);
    })

    it("burn full", async() => {
        await reg.testAdd(owner, 1, -100, 100, 250000, 12500);
        await reg.testBurn(owner, 1, -100, 100, 100000, 13500);
        await reg.testBurn(owner, 1, -100, 100, 150000, 12800);
        let result = await reg.getPos(owner, 1, -100, 100);
        expect(result[0].toNumber()).to.equal(0);
        // Fee mileage on 0 liquidity doesn't matter for functionality, but
        // current implementation is to reset to 0 for gas refund
        expect(result[1].toNumber()).to.equal(0); 
    })

    it("burn position only", async() => {
        await reg.testAdd(owner, 0, -100, 100, 250000, 12500);
        await reg.testAdd(owner, 0, -100, 99, 350000, 14500);
        await reg.testAdd(owner, 1, -100, 100, 450000, 18500);
        await reg.testBurn(owner, 0, -100, 100, 250000, 13500);

        let result = await reg.getPos(owner, 0, -100, 99);
        expect(result[0].toNumber()).to.equal(350000);
        expect(result[1].toNumber()).to.equal(14500);

        result = await reg.getPos(owner, 1, -100, 100);
        expect(result[0].toNumber()).to.equal(450000);
        expect(result[1].toNumber()).to.equal(18500);
    })

    const REWARD_ROUND_DOWN = 2

    it("burn rewards", async() => {
        await reg.testAdd(owner, 0, -100, 100, 250000, 12500);
        await reg.testBurn(owner, 0, -100, 100, 10000, 13500);
        let rewardOne = await reg.lastRewards();
        await reg.testBurn(owner, 0, -100, 100, 10000, 12500);
        let rewardTwo = await reg.lastRewards();
        await reg.testBurn(owner, 0, -100, 100, 10000, 14800);
        let rewardThree = await reg.lastRewards();

        await reg.testAdd(owner, 0, -100, 100, 220000, 16500);
        await reg.testBurn(owner, 0, -100, 100, 10000, 20500);
        let rewardFour = await reg.lastRewards();

        expect(rewardOne.toNumber()).to.equal(998);
        expect(rewardTwo.toNumber()).to.equal(0);
        expect(rewardThree.toNumber()).to.equal(2300 - REWARD_ROUND_DOWN);
        expect(rewardFour.toNumber()).to.eq(6000 - REWARD_ROUND_DOWN*2);
    })
})