import { TestLiquidityMath } from '../typechain/TestLiquidityMath';
import { expect } from "chai";
import chai from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import { toFixedGrowth } from './FixedPoint';

chai.use(solidity);

describe('LiquidityMath', () => {
   let liq: TestLiquidityMath

   beforeEach("deploy", async () => {
      const libFactory = await ethers.getContractFactory("TestLiquidityMath");
      liq = (await libFactory.deploy()) as TestLiquidityMath;
   })

   it("add", async () => {
      let result = await liq.testAddUnsigned(100, 150);
      expect(result.toNumber()).to.equal(250);
   })

   it("add signed", async () => {
      let resultOne = await liq.testAddSigned(100, 150);
      let resultTwo = await liq.testAddSigned(150, -75);
      let resultThree = await liq.testAddSigned(150, -150);
      
      expect(resultOne.toNumber()).to.equal(250);
      expect(resultTwo.toNumber()).to.equal(75);
      expect(resultThree.toNumber()).to.equal(0);      
      expect(liq.testAddSigned(200, -201)).to.be.reverted;
   }) 

   it("minus", async () => {
      let result = await liq.testMinus(100, 75);
      expect(result.toNumber()).to.equal(25);
      expect(liq.testMinus(100, 101)).to.be.reverted;
   })


   it("inflate", async () => {
      let resultOne = await liq.testInflate(100000, 0);
      let resultTwo = await liq.testInflate(100000, toFixedGrowth(0.0001256));
      let resultThree = await liq.testInflate(100000, toFixedGrowth(0.0352));
      let resultFour = await liq.testInflate(100000, toFixedGrowth(2.5956843));
      let resultFive = await liq.testInflate(100000, toFixedGrowth(486.493));
      
      expect(resultOne.toNumber()).to.equal(100000);
      expect(resultTwo.toNumber()).to.equal(100012);
      expect(resultThree.toNumber()).to.within(103519, 103520);
      expect(resultFour.toNumber()).to.within(359567, 359568);
      expect(resultFive.toNumber()).to.within(48749299, 48749300);
   })

   it("deflate", async () => {
      let resultOne = await liq.testDeflate(100000, 0);
      let resultTwo = await liq.testDeflate(100000, toFixedGrowth(0.0001256));
      let resultThree = await liq.testDeflate(100000, toFixedGrowth(0.0352));
      let resultFour = await liq.testDeflate(100000, toFixedGrowth(2.5956843));
      let resultFive = await liq.testDeflate(100000, toFixedGrowth(486.493));
      
      expect(resultOne.toNumber()).to.equal(100000);
      expect(resultTwo.toNumber()).to.equal(99987);
      expect(resultThree.toNumber()).to.equal(96599);
      expect(resultFour.toNumber()).to.equal(27811);
      expect(resultFive.toNumber()).to.equal(205);
   })

})
