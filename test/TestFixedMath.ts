import { TestCompoundMath } from '../typechain/TestCompoundMath';
import { expect } from "chai";
import chai from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import { toFixedGrowth, fromFixedGrowth, toSqrtPrice, fromSqrtPrice, toQ64, fromQ64, toQ48, fromQ48 } from './FixedPoint';
import { BigNumber } from 'ethers';

chai.use(solidity);

describe('TestFixedMath', () => {
   let comp: TestCompoundMath

   beforeEach("deploy", async () => {
      const libFactory = await ethers.getContractFactory("TestCompoundMath");
      comp = (await libFactory.deploy()) as TestCompoundMath;
   })

   it("mulQ64", async () => {
      let result = await comp.testMulQ64(toQ64(3.5), toQ64(5.25))
      expect(fromQ64(result)).to.equal(18.375);
   })

   it("mulQ64 Precision", async () => {
      let result = await comp.testMulQ64(BigNumber.from(2).pow(126), BigNumber.from(2).pow(127));
      expect(result).to.equal(BigNumber.from(2).pow(189));
   })

   it("mulQ48", async () => {
      let result = await comp.testMulQ48(toQ48(3.5), toQ48(5.25))
      expect(fromQ48(result)).to.equal(18.375);
   })

   it("mulQ48 Precision", async () => {
      let result = await comp.testMulQ48(BigNumber.from(2).pow(126), BigNumber.from(2).pow(63));
      expect(result).to.equal(BigNumber.from(2).pow(141));
   })

   it("divQ64", async () => {
      let result = await comp.testDivQ64(toQ64(3.5), toQ64(0.125))
      expect(fromQ64(result)).to.equal(28.0);
   })

   it("divQ64 Precision", async () => {
      let result = await comp.testDivQ64(BigNumber.from(2).pow(126), BigNumber.from(2).pow(3));
      expect(result).to.equal(BigNumber.from(2).pow(187));
   })

   it("divQ64Sq Precision", async () => {
      let result = await comp.testDivQ64Sq(BigNumber.from(2).pow(126), BigNumber.from(2).pow(3));
      expect(result).to.equal(BigNumber.from(2).pow(184));
   })

   it("recipQ64", async () => {
      let result = await comp.testRecipQ64(toQ64(8.0))
      expect(fromQ64(result)).to.equal(0.125);

      result = await comp.testRecipQ64(toQ64(0.0625))
      expect(fromQ64(result)).to.equal(16);
   })

   it("recipQ64 size bounds", async () => {
      expect(comp.testRecipQ64(1)).to.be.reverted
      expect(await comp.testRecipQ64(2)).to.equal(BigNumber.from(2).pow(127))
      expect(await comp.testRecipQ64(BigNumber.from(2).pow(127))).to.equal(2)
   })

})
