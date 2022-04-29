import { TestPool, makeTokenPool, Token, makeEtherPool, NativeEther } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, ZERO_ADDR } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber } from 'ethers';
import { MockVirtualToken } from '../typechain/MockVirtualToken';
import { CrocQuery } from '../typechain/CrocQuery';
import { AddressZero } from '@ethersproject/constants';

chai.use(solidity);

describe('Pool Virtual Tokens', () => {
  let test: TestPool
  let tracker: MockVirtualToken
  let baseToken: Token
  let quoteToken: Token
  let sender: string
  let other: string
  const feeRate = 225 * 100

  beforeEach("deploy",  async () => {
    let factory = await ethers.getContractFactory("MockVirtualToken")
    tracker = await (factory.deploy() as Promise<MockVirtualToken>)

    test = await makeTokenPool()
    baseToken = await test.base
    quoteToken = await test.quote
    sender = await (await test.trader).getAddress() 
       other = await (await test.other).getAddress() ;

    await test.initPool(feeRate, 0, 1, 1.5)
    await test.collectSurplus(sender, -100000, -2500000)

  })

  it("deposit", async() => {
    await tracker.setAccept(true)
    await test.testDepositVirt(await test.trader, tracker.address, 100, 100000, "0x1234")

    expect(await tracker.user_()).to.eq(await (await test.trader).getAddress())
    expect(await tracker.tokenSalt_()).to.eq(100)
    expect(await tracker.value_()).to.eq(100000)
    expect(await tracker.args_()).to.eq("0x1234");

    expect(await (await test.query).queryVirtual(await (await test.trader).getAddress(), tracker.address, 100)).to.eq(100000)
  })

  it("deposit reject", async() => {
    await tracker.setAccept(false)
    await expect(test.testDepositVirt(await test.trader, tracker.address, 100, 100000, "0x1234")).to.be.reverted
  })

  it("missing tracker contract", async() => {
    await tracker.setAccept(true)
    await expect(test.testDepositVirt(await test.trader, AddressZero, 100, 100000, "0x1234")).to.be.reverted
  })

  it("withdraw", async() => {
    await tracker.setAccept(true)
    await test.testDepositVirt(await test.trader, tracker.address, 100, 100000, "0x1234")
    await test.testWithdrawVirt(await test.trader, tracker.address, 100, 25000, "0x8976")
    

    expect(await tracker.user_()).to.eq(await (await test.trader).getAddress())
    expect(await tracker.tokenSalt_()).to.eq(100)
    expect(await tracker.value_()).to.eq(25000)
    expect(await tracker.args_()).to.eq("0x8976");

    expect(await (await test.query).queryVirtual(await (await test.trader).getAddress(), tracker.address, 100)).to.eq(75000)
  })

  it("withdraw full", async() => {
    await tracker.setAccept(true)
    await test.testDepositVirt(await test.trader, tracker.address, 100, 100000, "0x1234")
    await test.testWithdrawVirt(await test.trader, tracker.address, 100, 0, "0x8976")
    
    expect(await tracker.user_()).to.eq(await (await test.trader).getAddress())
    expect(await tracker.tokenSalt_()).to.eq(100)
    expect(await tracker.value_()).to.eq(100000)
    expect(await tracker.args_()).to.eq("0x8976");

    expect(await (await test.query).queryVirtual(await (await test.trader).getAddress(), tracker.address, 100)).to.eq(0)
  })

  it("withdraw all but", async() => {
    await tracker.setAccept(true)
    await test.testDepositVirt(await test.trader, tracker.address, 100, 100000, "0x1234")
    await test.testWithdrawVirt(await test.trader, tracker.address, 100, -5000, "0x8976")

    expect(await tracker.user_()).to.eq(await (await test.trader).getAddress())
    expect(await tracker.tokenSalt_()).to.eq(100)
    expect(await tracker.value_()).to.eq(95000)
    expect(await tracker.args_()).to.eq("0x8976");

    expect(await (await test.query).queryVirtual(await (await test.trader).getAddress(), tracker.address, 100)).to.eq(5000)
  })

  it("withdraw overdraw", async() => {
    await tracker.setAccept(true)
    await test.testDepositVirt(await test.trader, tracker.address, 100, 100000, "0x1234")
    await expect(test.testWithdrawVirt(await test.trader, tracker.address, 100, 100001, "0x1234")).to.be.reverted
  })

  it("withdraw reject", async() => {
    await tracker.setAccept(true)
    await test.testDepositVirt(await test.trader, tracker.address, 100, 100000, "0x1234")

    await tracker.setAccept(false)
    await expect(test.testWithdrawVirt(await test.trader, tracker.address, 100, 100000, "0x1234")).to.be.reverted
  })
})