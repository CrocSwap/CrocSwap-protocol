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

   it("encode pivot", async() => {
      let base = await knockout.testEncodePivotKey(35000, true, 25)
      expect(await knockout.testEncodePivotKey(36000, true, 25)).to.not.eq(base)
      expect(await knockout.testEncodePivotKey(35000, false, 25)).to.not.eq(base)
      expect(await knockout.testEncodePivotKey(35000, true, 26)).to.not.eq(base)
      expect(await knockout.testEncodePivotKey(35000, true, 25)).to.eq(base)
   })

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

   it("assert width", async() => {
      let width = 10
      let enabled = 1
      let params = enabled * 16 + width

      // Safe widths
      await expect(knockout.testAssertValid(true, 10240, 10240 + 1024, 20000, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(true, -10240, -10240 + 1024, 0, params)).to.not.be.reverted

      // Bad widths
      await expect(knockout.testAssertValid(true, 10240, 10240 + 2048, 20000, params)).to.be.reverted
      await expect(knockout.testAssertValid(true, -10240, -10240 + 2048, 0, params)).to.be.reverted
      await expect(knockout.testAssertValid(true, 10240, 10240 + 1000, 0, params)).to.be.reverted
      await expect(knockout.testAssertValid(true, 10240, 10240 + 512, 0, params)).to.be.reverted
   })

   it("assert disabled", async() => {
      let width = 10
      let disabled = 0
      let params = disabled * 16 + width

      // Knockout disabled
      await expect(knockout.testAssertValid(true, 10240, 10240 + 1024, 20000, params)).to.be.reverted
   })

   it("assert outside", async() => {
      let width = 10
      let enabled = 1
      let params = enabled * 16 + width

      // Outside position
      await expect(knockout.testAssertValid(true, 10240, 10240 + 1024, 20000, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(true, -10240, -10240 + 1024, 0, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(false, 10240, 10240 + 1024, 0, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(false, -10240, -10240 + 1024, -20000, params)).to.not.be.reverted


      // Inside position
      await expect(knockout.testAssertValid(true, 10240, 10240 + 1024, 10600, params)).to.be.reverted
      await expect(knockout.testAssertValid(true, -10240, -10240 + 1024, -10000, params)).to.be.reverted
      await expect(knockout.testAssertValid(false, 10240, 10240 + 1024, 10600, params)).to.be.reverted
      await expect(knockout.testAssertValid(false, -10240, -10240 + 1024, -10000, params)).to.be.reverted
      
      // Yonder position
      await expect(knockout.testAssertValid(true, 10240, 10240 + 1024, 0, params)).to.be.reverted
      await expect(knockout.testAssertValid(true, -10240, -10240 + 1024, -20000, params)).to.be.reverted
      await expect(knockout.testAssertValid(false, 10240, 10240 + 1024, 20000, params)).to.be.reverted
      await expect(knockout.testAssertValid(false, -10240, -10240 + 1024, 0, params)).to.be.reverted
      
   })

   it("assert inside", async() => {
      let width = 10
      let enabled = 2
      let params = enabled * 16 + width

      // Outside position
      await expect(knockout.testAssertValid(true, 10240, 10240 + 1024, 20000, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(true, -10240, -10240 + 1024, 0, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(false, 10240, 10240 + 1024, 0, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(false, -10240, -10240 + 1024, -20000, params)).to.not.be.reverted

      // Inside position
      await expect(knockout.testAssertValid(true, 10240, 10240 + 1024, 10600, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(true, -10240, -10240 + 1024, -10000, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(false, 10240, 10240 + 1024, 10600, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(false, -10240, -10240 + 1024, -10000, params)).to.not.be.reverted
      
      // Yonder position
      await expect(knockout.testAssertValid(true, 10240, 10240 + 1024, 0, params)).to.be.reverted
      await expect(knockout.testAssertValid(true, -10240, -10240 + 1024, -20000, params)).to.be.reverted
      await expect(knockout.testAssertValid(false, 10240, 10240 + 1024, 20000, params)).to.be.reverted
      await expect(knockout.testAssertValid(false, -10240, -10240 + 1024, 0, params)).to.be.reverted

   })

   it("assert yonder", async() => {
      let width = 10
      let enabled = 3
      let params = enabled * 16 + width

      // Outside position
      await expect(knockout.testAssertValid(true, 10240, 10240 + 1024, 20000, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(true, -10240, -10240 + 1024, 0, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(false, 10240, 10240 + 1024, 0, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(false, -10240, -10240 + 1024, -20000, params)).to.not.be.reverted

      // Inside position
      await expect(knockout.testAssertValid(true, 10240, 10240 + 1024, 10600, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(true, -10240, -10240 + 1024, -10000, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(false, 10240, 10240 + 1024, 10600, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(false, -10240, -10240 + 1024, -10000, params)).to.not.be.reverted

      // Yonder position
      await expect(knockout.testAssertValid(true, 10240, 10240 + 1024, 0, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(true, -10240, -10240 + 1024, -20000, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(false, 10240, 10240 + 1024, 20000, params)).to.not.be.reverted
      await expect(knockout.testAssertValid(false, -10240, -10240 + 1024, 0, params)).to.not.be.reverted
   })
})
