import { TestCurveMath } from '../typechain/TestCurveMath';
import { expect } from "chai";
import chai from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import { BigNumber } from 'ethers';
import { toFixedGrowth, toSqrtPrice, fromSqrtPrice, fromFixedGrowth, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { TestKnockoutLiq } from '../typechain/TestKnockoutLiq';

chai.use(solidity);

describe('Knockout Liquidity', () => {
   let knockout: TestKnockoutLiq

   beforeEach("deploy", async () => {
      const libFactory = await ethers.getContractFactory("TestKnockoutLiq");
      knockout = (await libFactory.deploy()) as TestKnockoutLiq;
   })

   /*it("encode pivot", async() => {
      let base = await knockout.testEncodePivotKey(35000, true, 25)
      expect(await knockout.testEncodePivotKey(36000, true, 25)).to.not.eq(base)
      expect(await knockout.testEncodePivotKey(35000, false, 25)).to.not.eq(base)
      expect(await knockout.testEncodePivotKey(35000, true, 26)).to.not.eq(base)
      expect(await knockout.testEncodePivotKey(35000, true, 25)).to.eq(base)
   })*/

   it("encode pos", async() => {
      let base = await knockout.testEncodePosKey(35000, 525000, true, 25, 128, 500)
      expect(await knockout.testEncodePosKey(35000, 525000, true, 25, 128, 500)).to.eq(base)
      expect(await knockout.testEncodePosKey(36000, 525000, true, 25, 128, 500)).to.not.eq(base)
      expect(await knockout.testEncodePosKey(35000, 225000, true, 25, 128, 500)).to.not.eq(base)
      expect(await knockout.testEncodePosKey(35000, 525000, false, 25, 128, 500)).to.not.eq(base)
      expect(await knockout.testEncodePosKey(35000, 525000, true, -25, 128, 500)).to.not.eq(base)
      expect(await knockout.testEncodePosKey(35000, 525000, true, 25, 256, 500)).to.not.eq(base)
      expect(await knockout.testEncodePosKey(35000, 525000, true, 25, 128, 700)).to.not.eq(base)   
   })

   it("proof no steps", async() => {
      await knockout.testCommit(100, 5000, 128, 850000)
      let state = await knockout.testProof(0, [])
      expect(state[0]).to.be.equal(5000)
      expect(state[1]).to.be.equal(850000)
   })

   it("proof no steps history", async() => {
      await knockout.testCommit(200, 8000, 256, 550000)
      await knockout.testCommit(100, 5000, 128, 850000)
      let state = await knockout.testProof(0, [])
      expect(state[0]).to.be.equal(5000)
      expect(state[1]).to.be.equal(850000)
   })

   /*it("proof merkle one step", async() => {
      await knockout.testCommit(200, 5000, 256, 550000)
      await knockout.testCommit(100, 6000, 128, 850000)
      await knockout.testCommit(100, 7000, 128, 950000)
      await knockout.testCommit(100, 8000, 128, 975000)
      await knockout.testCommit(100, 9000, 128, 250000)

      let pivotTime = BigNumber.from(9000).shl()
      let state = await knockout.testProof(0, [])
      expect(state[0]).to.be.equal(8000)
      expect(state[1]).to.be.equal(550000)
   })*/

   function proofEncap (time: number, mileage: number): BigNumber {
      return BigNumber.from(time).shl(64).add(BigNumber.from(mileage))
   }

   it("proof merkle one step", async() => {
      await knockout.testCommit(200, 5000, 256, 550000)
      await knockout.testCommit(100, 6000, 128, 850000)

      let proof = [proofEncap(0, 0), proofEncap(5000, 550000)]
      let state = await knockout.testProof(0, proof)
      expect(state[0]).to.be.equal(0)
      expect(state[1]).to.be.equal(0)
   })

   it("proof merkle multi steps", async() => {
      await knockout.testCommit(200, 5000, 256, 550000)
      await knockout.testCommit(100, 6000, 128, 850000)
      await knockout.testCommit(100, 7000, 128, 750000)
      await knockout.testCommit(100, 8000, 128, 650000)
      await knockout.testCommit(100, 9000, 128, 550000)

      let proof = [proofEncap(0, 0), proofEncap(5000, 550000),
         proofEncap(6000, 850000), proofEncap(7000, 750000), 
         proofEncap(8000, 650000)]
         
      let state = await knockout.testProof(0, proof)
      expect(state[0]).to.be.equal(0)
      expect(state[1]).to.be.equal(0)
   })

   it("proof merkle middle step", async() => {
      await knockout.testCommit(200, 5000, 256, 550000)
      await knockout.testCommit(100, 6000, 128, 850000)
      await knockout.testCommit(100, 7000, 128, 750000)

      let root = (await knockout.merkle_()).merkleRoot_
      await knockout.testCommit(100, 8000, 128, 650000)
      await knockout.testCommit(100, 9000, 128, 550000)

      let proof = [proofEncap(7000, 750000), 
         proofEncap(8000, 650000)]
         
      let state = await knockout.testProof(root, proof)
      expect(state[0]).to.be.equal(7000)
      expect(state[1]).to.be.equal(750000)
   })

})
