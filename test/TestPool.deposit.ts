import { TestPool, makeTokenPool, Token, makeEtherPool, NativeEther, ERC20Token } from '../test/FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, ZERO_ADDR } from '../test/FixedPoint';
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
       await test.collectSurplus(sender, -100000, -2500000)

    })

    it("deposit", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let initBal = await baseToken.balanceOf(pool.address)
      await test.testDeposit(await test.trader, other, 5000, baseToken.address)

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
      await test.testDeposit(await test.trader, other, 5000, ZERO_ADDR,
        {value: 5000})

      let nextBal = await nativeEth.balanceOf(pool.address)
      expect(nextBal.sub(initBal)).to.equal(5000)
      expect(await query.querySurplus(other, ZERO_ADDR)).to.equal(5000)
      expect(await query.querySurplus(other, baseToken.address)).to.equal(0)
      expect(await query.querySurplus(other, quoteToken.address)).to.equal(0)
      expect(await query.querySurplus(sender, ZERO_ADDR)).to.equal(initSurplus)
    })

    it("deposit native insufficient value", async() => {
      let pool = await test.dex
      expect(test.testDeposit(await test.trader, other, 5000, ZERO_ADDR, {value: 4999})).to.be.reverted
    })


    it("deposit permit", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let initBal = await baseToken.balanceOf(pool.address)

      let deadline = 25000
      let v = 28
      let r = 817
      let s = 912
    
      await test.testDepositPermit(await test.trader, other, 5000, baseToken.address,
        deadline, v, r, s)
      let nextBal = await baseToken.balanceOf(pool.address)
      expect(nextBal.sub(initBal)).to.equal(5000)
      expect(await query.querySurplus(other, baseToken.address)).to.equal(5000)
      expect(await query.querySurplus(other, quoteToken.address)).to.equal(0)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(initSurplus)

      expect(await (baseToken as ERC20Token).contract.owner712()).to.equal(other)
      expect(await (baseToken as ERC20Token).contract.spender712()).to.equal((await test.dex).address)
      expect(await (baseToken as ERC20Token).contract.amount712()).to.equal(5000)
      expect(await (baseToken as ERC20Token).contract.deadline712()).to.equal(deadline)
      expect(await (baseToken as ERC20Token).contract.v712()).to.equal(v)
      expect(await (baseToken as ERC20Token).contract.r712()).to.equal(r)
      expect(await (baseToken as ERC20Token).contract.s712()).to.equal(s)
    })

    it("disburse", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let quoteSurplus = await query.querySurplus(sender, quoteToken.address)
      let initBal = await baseToken.balanceOf(other)
      await test.testDisburse(await test.trader, other, 5000, baseToken.address)

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
      await test.testCollectSurplus(await test.trader, sender, -25000, ZERO_ADDR, false, {value: 25000})

      let initSurplus = await query.querySurplus(sender, ZERO_ADDR)
      let initOtherSurplus = await query.querySurplus(other, ZERO_ADDR)
      let initBal = await nativeEth.balanceOf(other)
      await test.testDisburse(await test.trader, other, 5000, ZERO_ADDR)

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
      await test.testDisburse(await test.trader, other, initSurplus, baseToken.address)

      let nextBal = await baseToken.balanceOf(other)
      expect(nextBal.sub(initBal)).to.equal(initSurplus)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(0)
    })

    it("disburse full infer", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let initBal = await baseToken.balanceOf(other)
      await test.testDisburse(await test.trader, other, 0, baseToken.address)

      let nextBal = await baseToken.balanceOf(other)
      expect(nextBal.sub(initBal)).to.equal(initSurplus)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(0)
    })

    it("disburse over-size", async() => {
      let pool = await test.dex
      let initBal = await baseToken.balanceOf(other)
      expect(test.testDisburse(await test.trader, other, initBal.add(1), baseToken.address)).to.be.reverted
    })

    it("disburse all but", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let initBal = await baseToken.balanceOf(other)
      await test.testDisburse(await test.trader, other, -500, baseToken.address)

      let nextBal = await baseToken.balanceOf(other)
      expect(nextBal.sub(initBal)).to.equal(initSurplus.sub(500))
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(500)
    })

    it("transfer", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let initBal = await query.querySurplus(other, baseToken.address)
      await test.testTransfer(await test.trader, other, 5000, baseToken.address)

      expect(await query.querySurplus(other, baseToken.address)).to.equal(initBal.add(5000))
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(initSurplus.sub(5000))
    })

    it("transfer full", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let initBal = await query.querySurplus(other, baseToken.address)
      await test.testTransfer(await test.trader, other, initSurplus, baseToken.address)

      expect(await query.querySurplus(other, baseToken.address)).to.equal(initBal.add(initSurplus))
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(0)
    })

    it("transfer all but", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let initBal = await query.querySurplus(other, baseToken.address)
      await test.testTransfer(await test.trader, other, -500, baseToken.address)

      expect(await query.querySurplus(other, baseToken.address)).to.equal(initSurplus.sub(500))
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(500);
    })

    it("transfer full infer", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let initBal = await query.querySurplus(other, baseToken.address)
      await test.testTransfer(await test.trader, other, 0, baseToken.address)

      expect(await query.querySurplus(other, baseToken.address)).to.equal(initBal.add(initSurplus))
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(0)
    })

    it("transfer over", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let initBal = await query.querySurplus(other, baseToken.address)
      expect(test.testCollectSurplus(await test.trader, other, initSurplus.add(1), baseToken.address, true)).to.be.reverted
    })

    it("side pocket", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)

      const BASE_SALT = 0
      const SIDE_SALT = 5000

      // Move to side pocket
      await test.testSidePocket(await test.trader, BASE_SALT, SIDE_SALT, initSurplus, baseToken.address)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(0)

      // Move back
      await test.testSidePocket(await test.trader, SIDE_SALT, BASE_SALT, initSurplus, baseToken.address)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(initSurplus)
    })

    it("side partial", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)

      const BASE_SALT = 0
      const SIDE_SALT = 5000

      // Move to side pocket
      await test.testSidePocket(await test.trader, BASE_SALT, SIDE_SALT, initSurplus.sub(5000), baseToken.address)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(5000)

      // Move back
      await test.testSidePocket(await test.trader, SIDE_SALT, BASE_SALT, initSurplus.sub(15000), baseToken.address)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(initSurplus.sub(10000))
    })


    it("side zero full", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)

      const BASE_SALT = 0
      const SIDE_SALT = 5000

      // Move to side pocket
      await test.testSidePocket(await test.trader, BASE_SALT, SIDE_SALT, 0, baseToken.address)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(0)

      // Move back
      await test.testSidePocket(await test.trader, SIDE_SALT, BASE_SALT, 0, baseToken.address)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(initSurplus)
    })

    it("side all but", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)

      const BASE_SALT = 0
      const SIDE_SALT = 5000

      // Move to side pocket
      await test.testSidePocket(await test.trader, BASE_SALT, SIDE_SALT, -5000, baseToken.address)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(5000)

      // Move back
      await test.testSidePocket(await test.trader, SIDE_SALT, BASE_SALT, -10000, baseToken.address)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(initSurplus.sub(10000))
    })

    it("side pocket protects capital", async() => {
      let pool = await test.dex
      let query = await test.query
      let initSurplus = await query.querySurplus(sender, baseToken.address)
      let initBal = await baseToken.balanceOf(other)

      const BASE_SALT = 0
      const SIDE_SALT = 5000

      // Move to side pocket
      await test.testSidePocket(await test.trader, BASE_SALT, SIDE_SALT, -5000, baseToken.address)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(5000)

      // Disburse, but only from the main pocket
      await test.testDisburse(await test.trader, other, -500, baseToken.address)
      let nextBal = await baseToken.balanceOf(other)
      expect(nextBal.sub(initBal)).to.equal(4500)

      // Move back
      await test.testSidePocket(await test.trader, SIDE_SALT, BASE_SALT, 0, baseToken.address)
      expect(await query.querySurplus(sender, baseToken.address)).to.equal(initSurplus.sub(4500))
    })


})