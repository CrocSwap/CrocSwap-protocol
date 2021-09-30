import { TestSettleLayer } from '../typechain/TestSettleLayer'
import { MockFactory } from '../typechain/MockFactory'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { CrocSwapPool } from '../typechain/CrocSwapPool';
import { Signer, BigNumber, Overrides, PayableOverrides } from 'ethers';

chai.use(solidity);

describe('Settle Layer', () => {
    let test: TestSettleLayer
    let tokenX: MockERC20
    let tokenY: MockERC20
    let sender: Signer
    let sendAddr: string
    const INIT_BAL = 100000000000

    const ZERO_ADDR = "0x0000000000000000000000000000000000000000"
    const RECV_ADDR = "0x00000000000000000000000000000000000E7ABC"

    beforeEach("deploy",  async () => {
       let factory = await ethers.getContractFactory("MockERC20")
       tokenX = await factory.deploy() as MockERC20
       tokenY = await factory.deploy() as MockERC20

       factory = await ethers.getContractFactory("TestSettleLayer")
       test = await factory.deploy(RECV_ADDR) as TestSettleLayer
        
       let accts = await ethers.getSigners()
       sender = accts[0]
       sendAddr = await sender.getAddress()

       await tokenX.deposit(test.address, INIT_BAL);
       await tokenX.connect(sender).approve(test.address, INIT_BAL);
       await tokenX.approveFor(RECV_ADDR, test.address, INIT_BAL);
    })

    it("debit", async() => {
        await tokenX.deposit(RECV_ADDR, INIT_BAL)
        await test.connect(sender).testSettleFlow(85000, tokenX.address)
        expect((await tokenX.balanceOf(RECV_ADDR))).to.eq(INIT_BAL-85000);
        expect((await tokenX.balanceOf(test.address))).to.eq(INIT_BAL+85000);
        expect((await test.querySurplus(RECV_ADDR, tokenX.address))).to.eq(0)
    })

    it("credit", async() => {
        await test.connect(sender).testSettleFlow(-5000, tokenX.address)
        expect((await tokenX.balanceOf(RECV_ADDR))).to.eq(5000);
        expect((await tokenX.balanceOf(test.address))).to.eq(INIT_BAL-5000);
        expect((await test.querySurplus(RECV_ADDR, tokenX.address))).to.eq(0)
    })

    it("debit shortfall", async() => {
        await tokenX.deposit(RECV_ADDR, 84999)
        expect(test.connect(sender).testSettleFlow(85000, tokenX.address)).to.be.reverted
    })

    it("credit shortfall", async() => {
        await tokenY.deposit(RECV_ADDR, 4999)
        expect(test.connect(sender).testSettleFlow(-5000, tokenY.address)).to.be.reverted
    })

    it("zero", async() => {
        await test.connect(sender).testSettleFlow(0, tokenX.address)
        expect((await tokenX.balanceOf(RECV_ADDR))).to.eq(0);
        expect((await tokenX.balanceOf(test.address))).to.eq(INIT_BAL);
        expect((await test.querySurplus(RECV_ADDR, tokenX.address))).to.eq(0)
    })

    it("debit ether", async() => {
        let overrides = { value: BigNumber.from(25000) }
        await test.connect(sender).testSettleFlow(25000, ZERO_ADDR, overrides)
        expect((await test.getMyBalance())).to.equal(25000)
        expect((await test.getBalance(RECV_ADDR))).to.equal(0)
        expect((await test.querySurplus(RECV_ADDR, ZERO_ADDR))).to.eq(0)
    })

    it("credit ether", async() => {
        // First add ether to the test address...
        let overrides = { value: BigNumber.from(75000) }
        await test.connect(sender).testSettleFlow(75000, ZERO_ADDR, overrides)

        await test.connect(sender).testSettleFlow(-1024, ZERO_ADDR)
        expect((await test.getMyBalance())).to.equal(75000-1024)
        expect((await test.getBalance(RECV_ADDR))).to.equal(1024)
        expect((await test.querySurplus(RECV_ADDR, ZERO_ADDR))).to.eq(0)
    })

    it("debit ether shortfall", async() => {
        let overrides = { value: BigNumber.from(24999) }
        expect(test.connect(sender).testSettleFlow(25000, ZERO_ADDR, overrides)).to.be.reverted
    })

    it("credit ether shortfall", async() => {
        // First add ether to the test address...
        let overrides = { value: BigNumber.from(84999) }
        await test.connect(sender).testSettleFlow(84999, ZERO_ADDR, overrides)
        expect(test.connect(sender).testSettleFlow(-85000, ZERO_ADDR)).to.be.reverted
    })
})
