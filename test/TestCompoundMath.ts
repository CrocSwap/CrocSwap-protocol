import { TestCompoundMath } from '../typechain/TestCompoundMath';
import { expect } from "chai";
import chai from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import { toFixedGrowth, fromFixedGrowth, toSqrtPrice, fromSqrtPrice } from './FixedPoint';

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


   it("stack", async () => {
      let result = await comp.testStack(toFixedGrowth(0), toFixedGrowth(0));
      expect(fromFixedGrowth(result)).to.equal(0);

      result = await comp.testStack(toFixedGrowth(0.02), toFixedGrowth(0));
      expect(result).to.gte(toFixedGrowth(0.02));

      result = await comp.testStack(toFixedGrowth(0.02), toFixedGrowth(0.01));
      expect(fromFixedGrowth(result)).to.gte(0.0301999);
      expect(fromFixedGrowth(result)).to.lte(0.0302);

      result = await comp.testStack(toFixedGrowth(0.25), toFixedGrowth(0.1));
      expect(fromFixedGrowth(result)).to.gte(0.374999);
      expect(fromFixedGrowth(result)).to.lte(0.375);
   })

   it("divide", async () => {
      let result = await comp.testDivide(5, 4);
      expect(fromFixedGrowth(result)).to.equal(0.25);

      result = await comp.testDivide(105, 100);
      expect(fromFixedGrowth(result)).to.within(0.049999, 0.05);

      result = await comp.testDivide(20005, 20000);
      expect(fromFixedGrowth(result)).to.within(0.0002499, 0.00025);

      // Compound divide caps result at 100% growth
      result = await comp.testDivide(20, 5);
      expect(fromFixedGrowth(result)).to.equal(1.0);
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

   it("price", async () => {
      // Remember price growth is in square roots
      let result = await comp.testPrice(toSqrtPrice(4.0), toFixedGrowth(1.5), true);
      expect(fromSqrtPrice(result)).to.equal(25.0);

      // 50% deflated means the result will be 2/3 the square root of the starting price
      result = await comp.testPrice(toSqrtPrice(81.0), toFixedGrowth(0.5), false);
      expect(fromSqrtPrice(result)).to.equal(36.0);

      result = await comp.testPrice(toSqrtPrice(100.0), toFixedGrowth(0.001), true);
      expect(fromSqrtPrice(result)).to.within(100.2, 100.2001);

      result = await comp.testPrice(toSqrtPrice(100.0), toFixedGrowth(0.0025), false);
      expect(fromSqrtPrice(result)).to.within(99.50186, 99.50187);
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

   it("deflate", async () => {
      let resultOne = await comp.testDeflate(100000, toFixedGrowth(0));
      let resultTwo = await comp.testDeflate(100000, toFixedGrowth(0.0001256));
      let resultThree = await comp.testDeflate(100000, toFixedGrowth(0.0352));
      let resultFour = await comp.testDeflate(100000, toFixedGrowth(2.5956843));
      let resultFive = await comp.testDeflate(100000, toFixedGrowth(486.493));
      
      expect(resultOne.toNumber()).to.equal(100000);
      expect(resultTwo.toNumber()).to.equal(99987);
      expect(resultThree.toNumber()).to.equal(96599);
      expect(resultFour.toNumber()).to.equal(27811);
      expect(resultFive.toNumber()).to.equal(205)
   })
})
