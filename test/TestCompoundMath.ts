import { TestCompoundMath } from '../typechain/TestCompoundMath';
import { expect } from "chai";
import chai from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import { toFixedGrowth, fromFixedGrowth } from './FixedPoint';

chai.use(solidity);

describe('TestCompoundMath', () => {
   let comp: TestCompoundMath

   beforeEach("deploy", async () => {
      const libFactory = await ethers.getContractFactory("TestCompoundMath");
      comp = (await libFactory.deploy()) as TestCompoundMath;
   })

   it("sqrt", async () => {
      let result = await comp.testSqrt(toFixedGrowth(0));
      expect(fromFixedGrowth(result)).to.equal(0);

      result = await comp.testSqrt(toFixedGrowth(0.01));
      expect(fromFixedGrowth(result)).to.lte(0.005);
      expect(fromFixedGrowth(result)).to.gte(0.004987);

      result = await comp.testSqrt(toFixedGrowth(0.5));
      expect(fromFixedGrowth(result)).to.lte(0.25);
      expect(fromFixedGrowth(result)).to.gte(0.21875); 
   })


   it("add", async () => {
      let result = await comp.testAdd(toFixedGrowth(0), toFixedGrowth(0));
      expect(fromFixedGrowth(result)).to.equal(0);

      result = await comp.testAdd(toFixedGrowth(0.02), toFixedGrowth(0));
      expect(result).to.gte(toFixedGrowth(0.02));

      result = await comp.testAdd(toFixedGrowth(0.02), toFixedGrowth(0.01));
      expect(fromFixedGrowth(result)).to.gte(0.0301999);
      expect(fromFixedGrowth(result)).to.lte(0.0302);

      result = await comp.testAdd(toFixedGrowth(0.25), toFixedGrowth(0.1));
      expect(fromFixedGrowth(result)).to.gte(0.374999);
      expect(fromFixedGrowth(result)).to.lte(0.375);
   })


   it("shrink", async () => {
      let result = await comp.testShrink(toFixedGrowth(0), toFixedGrowth(0));
      expect(fromFixedGrowth(result)).to.equal(0);

      result = await comp.testShrink(toFixedGrowth(0.02), toFixedGrowth(0));
      expect(result).to.gte(toFixedGrowth(0.02));

      result = await comp.testShrink(toFixedGrowth(0.02), toFixedGrowth(0.01));
      expect(fromFixedGrowth(result)).to.lte(0.01980198);
      expect(fromFixedGrowth(result)).to.gte(0.01980195);

      result = await comp.testShrink(toFixedGrowth(0.25), toFixedGrowth(0.1));
      expect(fromFixedGrowth(result)).to.gte(0.22727271);
      expect(fromFixedGrowth(result)).to.lte(0.22727273);
   })


   it("inflate", async () => {
      let resultOne = await comp.testInflate(100000, 0);
      let resultTwo = await comp.testInflate(100000, toFixedGrowth(0.0001256));
      let resultThree = await comp.testInflate(100000, toFixedGrowth(0.0352));
      let resultFour = await comp.testInflate(100000, toFixedGrowth(2.5956843));
      let resultFive = await comp.testInflate(100000, toFixedGrowth(486.493));
      
      expect(resultOne.toNumber()).to.equal(100000);
      expect(resultTwo.toNumber()).to.equal(100012);
      expect(resultThree.toNumber()).to.within(103519, 103520);
      expect(resultFour.toNumber()).to.within(359567, 359568);
      expect(resultFive.toNumber()).to.within(48749299, 48749300);
   })
})
