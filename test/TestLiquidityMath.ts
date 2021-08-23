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



})
