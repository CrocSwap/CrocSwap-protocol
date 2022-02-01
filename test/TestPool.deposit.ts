import { TestPool, makeTokenPool, Token, makeEtherPool, NativeEther } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, ZERO_ADDR } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber } from 'ethers';

chai.use(solidity);

describe('Pool Surplus Deposits', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    let sender: string
    let other: string
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote
       sender = await (await test.trader).getAddress() 
       other = await (await test.other).getAddress() 

       await test.initPool(feeRate, 0, 1, 1.5)
       await (await test.dex).collect(sender, -100000, baseToken.address) 
       await (await test.dex).collect(sender, -250000, quoteToken.address) 

    })

    it("deposit", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let initBal = await baseToken.balanceOf(pool.address)
      await pool.collect(other, -5000, baseToken.address)

      let nextBal = await baseToken.balanceOf(pool.address)
      expect(nextBal.sub(initBal)).to.equal(5000)
      expect(await query.querySurplus(other, baseToken.address)).to.equal(5000)
      expect(await query.querySurplus(other, quoteToken.address)).to.equal(0)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(initSurplus)
    })

    it("deposit native", async() => {
      let nativeEth = new NativeEther()
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, ZERO_ADDR)
      let initBal = await nativeEth.balanceOf(pool.address)
      await pool.collect(other, -5000, ZERO_ADDR, { value: 5000})

      let nextBal = await nativeEth.balanceOf(pool.address)
      expect(nextBal.sub(initBal)).to.equal(5000)
      expect(await query.querySurplus(other, ZERO_ADDR)).to.equal(5000)
      expect(await query.querySurplus(other, baseToken.address)).to.equal(0)
      expect(await query.querySurplus(other, quoteToken.address)).to.equal(0)
      expect(await query.querySurplus(sender, ZERO_ADDR)).to.equal(initSurplus)
    })

    it("deposit native insufficient value", async() => {
      let pool = await test.dex
      expect(pool.collect(other, -5000, ZERO_ADDR, { value: 4999})).to.be.reverted
    })

    it("disburse", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let quoteSurplus = await query.querySurplus(sender, quoteToken.address)
      let initBal = await baseToken.balanceOf(other)
      await pool.collect(other, 5000, baseToken.address)

      let nextBal = await baseToken.balanceOf(other)
      expect(nextBal.sub(initBal)).to.equal(5000)
      expect(await query.querySurplus(other, baseToken.address)).to.equal(0)
      expect(await query.querySurplus(sender, quoteToken.address)).to.equal(quoteSurplus)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(initSurplus.sub(5000))
    })

    it("disburse native", async() => {
      let nativeEth = new NativeEther()
      let pool = await test.dex
      let query = await test.query

      // Fund surplus collateral so we can disburse
      await pool.collect(sender, -25000, ZERO_ADDR, {value: 25000})

      let initSurplus = await query.querySurplus(sender, ZERO_ADDR)
      let initOtherSurplus = await query.querySurplus(other, ZERO_ADDR)
      let initBal = await nativeEth.balanceOf(other)
      await pool.collect(other, 5000, ZERO_ADDR)

      let nextBal = await nativeEth.balanceOf(other)
      expect(nextBal.sub(initBal)).to.equal(5000)
      expect(await query.querySurplus(other, ZERO_ADDR)).to.equal(initOtherSurplus)
      expect(await query.querySurplus(sender, ZERO_ADDR)).to.equal(initSurplus.sub(5000))
    })

    it("disburse full", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let initBal = await baseToken.balanceOf(other)
      await pool.collect(other, initSurplus, baseToken.address)

      let nextBal = await baseToken.balanceOf(other)
      expect(nextBal.sub(initBal)).to.equal(initSurplus)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(0)
    })

    it("disburse full infer", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let initBal = await baseToken.balanceOf(other)
      await pool.collect(other, 0, baseToken.address)

      let nextBal = await baseToken.balanceOf(other)
      expect(nextBal.sub(initBal)).to.equal(initSurplus)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(0)
    })

    it("disburse over-size", async() => {
      let pool = await test.dex
      let initBal = await baseToken.balanceOf(other)
      expect(pool.collect(other, initBal.add(1), baseToken.address)).to.be.reverted
    })

})