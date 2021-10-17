import { TestSettleLayer } from '../typechain/TestSettleLayer'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { Signer, BigNumber, Overrides, PayableOverrides } from 'ethers';
import { ZERO_ADDR } from './FixedPoint';
import { start } from 'repl';

chai.use(solidity);

describe('Settle Layer Ethereum', () => {
    let test: TestSettleLayer
    let tokenX: MockERC20
    let tokenY: MockERC20
    let sender: Signer
    let sendAddr: string
    const INIT_BAL = 100000000000

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

    it("settle debit", async() => {
        let startTestBal = (await test.getMyBalance()).toNumber()
        let startRecvBal = (await test.getBalance(RECV_ADDR)).toNumber()

        await tokenX.deposit(RECV_ADDR, INIT_BAL)

        await test.connect(sender).testSettleFlow(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)

        await test.connect(sender).testSettleFlow(90000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(90000)

        await test.connect(sender).testSettleFlow(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(90000)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(90000)
        await test.connect(sender).testSettleFlow(-40000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(50000)

        await test.setFinal(true)

        // Enough to cover this settle, but not enough with the previous ether flow
        let overrides = { value: BigNumber.from(55000) }
        expect(test.connect(sender).testSettleFlow(9000, ZERO_ADDR, overrides)).to.be.reverted

        overrides = { value: BigNumber.from(60000) }
        await test.connect(sender).testSettleFlow(9000, ZERO_ADDR, overrides)
        
        expect((await test.getMyBalance())).to.equal(startTestBal + 59000)
        expect((await test.getBalance(RECV_ADDR))).to.equal(startRecvBal + 1000)
        expect((await test.testQuerySurplus(RECV_ADDR, ZERO_ADDR))).to.eq(0)
    })

    it("settle credit", async() => {
        await test.connect(sender).fund({value: 100000})
        let startTestBal = (await test.getMyBalance()).toNumber()
        let startRecvBal = (await test.getBalance(RECV_ADDR)).toNumber()

        await tokenX.deposit(RECV_ADDR, INIT_BAL)

        await test.connect(sender).testSettleFlow(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)

        await test.connect(sender).testSettleFlow(150000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(150000)

        await test.connect(sender).testSettleFlow(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(150000)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(150000)
        await test.connect(sender).testSettleFlow(-200000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(-50000)

        await test.setFinal(true)

        // Should get refunded
        let overrides = { value: BigNumber.from(60000) }
        await test.connect(sender).testSettleFlow(9000, ZERO_ADDR, overrides)
        
        expect((await test.getMyBalance())).to.equal(startTestBal - 41000)
        expect((await test.getBalance(RECV_ADDR))).to.equal(startRecvBal + 101000)
        expect((await test.testQuerySurplus(RECV_ADDR, ZERO_ADDR))).to.eq(0)
    })

    it("settle flat", async() => {
        let startTestBal = (await test.getMyBalance()).toNumber()
        let startRecvBal = (await test.getBalance(RECV_ADDR)).toNumber()

        await tokenX.deposit(RECV_ADDR, INIT_BAL)

        await test.connect(sender).testSettleFlow(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)

        await test.connect(sender).testSettleFlow(90000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(90000)

        await test.connect(sender).testSettleFlow(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(90000)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(90000)
        await test.connect(sender).testSettleFlow(-95000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(-5000)

        await test.setFinal(true)

        // Should get refunded 
        let overrides = { value: BigNumber.from(60000) }
        await test.connect(sender).testSettleFlow(5000, ZERO_ADDR, overrides)
        
        expect((await test.getMyBalance())).to.equal(startTestBal)
        expect((await test.getBalance(RECV_ADDR))).to.equal(startRecvBal + 60000)
        expect((await test.testQuerySurplus(RECV_ADDR, ZERO_ADDR))).to.eq(0)
    })

    it("settle final on non-ethereum token", async() => {
        let startTestBal = (await test.getMyBalance()).toNumber()
        let startRecvBal = (await test.getBalance(RECV_ADDR)).toNumber()

        await tokenX.deposit(RECV_ADDR, INIT_BAL)

        await test.connect(sender).testSettleFlow(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)

        await test.connect(sender).testSettleFlow(90000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(90000)

        await test.connect(sender).testSettleFlow(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(90000)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(90000)
        await test.connect(sender).testSettleFlow(-40000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(50000)

        await test.setFinal(true)

        // Enough to cover this settle, but not enough with the previous ether flow
        let overrides = { value: BigNumber.from(45000) }
        expect(test.connect(sender).testSettleFlow(9000, tokenX.address, overrides)).to.be.reverted

        overrides = { value: BigNumber.from(55000) }
        await test.connect(sender).testSettleFlow(9000, tokenX.address, overrides)
        
        expect((await test.getMyBalance())).to.equal(startTestBal + 50000)
        expect((await test.getBalance(RECV_ADDR))).to.equal(startRecvBal + 5000)
        expect((await test.testQuerySurplus(RECV_ADDR, ZERO_ADDR))).to.eq(0)
    })

    it("settle debit surplus", async() => {
        // Fund surplus
        let ORIG_SURPLUS = 100000
        await test.setFinal(true)
        await test.testSettleReserves(-100000, ZERO_ADDR, {value: BigNumber.from(ORIG_SURPLUS)})
        await test.setFinal(false)

        let startTestBal = (await test.getMyBalance()).toNumber()
        let startRecvBal = (await test.getBalance(RECV_ADDR)).toNumber()

        await tokenX.deposit(RECV_ADDR, INIT_BAL)

        await test.connect(sender).testSettleFlow(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)

        // For Ether, surplus is ignored until the final directive
        await test.connect(sender).testSettleFlow(45000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(45000)
        await test.connect(sender).testSettleReserves(45000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(90000)

        await test.connect(sender).testSettleReserves(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(90000)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(90000)
        await test.connect(sender).testSettleReserves(-20000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(70000)
        await test.connect(sender).testSettleFlow(-20000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(50000)

        // Make sure we haven't settled either in Ether or surplus
        expect((await test.getMyBalance())).to.equal(startTestBal + 0)
        expect((await test.getBalance(RECV_ADDR))).to.equal(startRecvBal + 0)
        expect((await test.testQuerySurplus(RECV_ADDR, ZERO_ADDR))).to.eq(ORIG_SURPLUS)

        // Should refund full amoutnt because it pays out of surplus
        await test.setFinal(true)
        await test.connect(sender).testSettleReserves(9000, ZERO_ADDR, {value: BigNumber.from(60000)})
        
        expect((await test.getMyBalance())).to.equal(startTestBal)
        expect((await test.getBalance(RECV_ADDR))).to.equal(startRecvBal + 60000)
        expect((await test.testQuerySurplus(RECV_ADDR, ZERO_ADDR))).to.eq(ORIG_SURPLUS - 59000)
    })

    it("settle debit surplus partial", async() => {
        // Fund surplus
        let ORIG_SURPLUS = 100000
        await test.setFinal(true)
        await test.testSettleReserves(-100000, ZERO_ADDR, {value: BigNumber.from(ORIG_SURPLUS)})
        await test.setFinal(false)

        let startTestBal = (await test.getMyBalance()).toNumber()
        let startRecvBal = (await test.getBalance(RECV_ADDR)).toNumber()

        await tokenX.deposit(RECV_ADDR, INIT_BAL)

        await test.connect(sender).testSettleFlow(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)

        // For Ether, surplus is ignored until the final directive
        await test.connect(sender).testSettleFlow(45000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(45000)
        await test.connect(sender).testSettleReserves(45000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(90000)

        await test.connect(sender).testSettleReserves(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(90000)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(90000)
        await test.connect(sender).testSettleReserves(-20000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(70000)
        await test.connect(sender).testSettleFlow(-20000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(50000)

        // Make sure we haven't settled either in Ether or surplus
        expect((await test.getMyBalance())).to.equal(startTestBal + 0)
        expect((await test.getBalance(RECV_ADDR))).to.equal(startRecvBal + 0)
        expect((await test.testQuerySurplus(RECV_ADDR, ZERO_ADDR))).to.eq(ORIG_SURPLUS)

        // Should refund full amoutnt because it pays out of surplus
        await test.setFinal(true)
        await expect(test.connect(sender).testSettleReserves
            (120000, ZERO_ADDR, {value: BigNumber.from(60000)})).to.be.reverted

        await test.connect(sender).testSettleReserves(120000, ZERO_ADDR, {value: BigNumber.from(75000)})

        expect((await test.getMyBalance())).to.equal(startTestBal + 70000)
        expect((await test.getBalance(RECV_ADDR))).to.equal(startRecvBal + 5000)
        expect((await test.testQuerySurplus(RECV_ADDR, ZERO_ADDR))).to.eq(0)
    })

    it("settle credit", async() => {
        let startTestBal = (await test.getMyBalance()).toNumber()
        let startRecvBal = (await test.getBalance(RECV_ADDR)).toNumber()

        await tokenX.deposit(RECV_ADDR, INIT_BAL)

        await test.connect(sender).testSettleFlow(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)

        // For Ether, surplus is ignored until the final directive
        await test.connect(sender).testSettleFlow(45000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(45000)
        await test.connect(sender).testSettleReserves(45000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(90000)

        await test.connect(sender).testSettleReserves(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(90000)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(90000)
        await test.connect(sender).testSettleReserves(-20000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(70000)
        await test.connect(sender).testSettleFlow(-120000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(-70000)

        // Make sure we haven't settled either in Ether or surplus
        expect((await test.getMyBalance())).to.equal(startTestBal + 0)
        expect((await test.getBalance(RECV_ADDR))).to.equal(startRecvBal + 0)
        expect((await test.testQuerySurplus(RECV_ADDR, ZERO_ADDR))).to.eq(0)

        // Should refund full amoutnt because it pays out of surplus
        await test.setFinal(true)
        await test.connect(sender).testSettleReserves(-15000, ZERO_ADDR, {value: BigNumber.from(60000)})
        
        expect((await test.getMyBalance())).to.equal(startTestBal)
        expect((await test.getBalance(RECV_ADDR))).to.equal(startRecvBal + 60000)
        expect((await test.testQuerySurplus(RECV_ADDR, ZERO_ADDR))).to.eq(85000)
    })

    it("settle refund", async() => {
        let startTestBal = (await test.getMyBalance()).toNumber()
        let startRecvBal = (await test.getBalance(RECV_ADDR)).toNumber()

        await tokenX.deposit(RECV_ADDR, INIT_BAL)

        await test.connect(sender).testSettleFlow(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(0)

        // For Ether, surplus is ignored until the final directive
        await test.connect(sender).testSettleFlow(45000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(45000)
        await test.connect(sender).testSettleReserves(45000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(90000)

        await test.connect(sender).testSettleReserves(-50000, tokenX.address)
        expect((await test.ethFlow())).to.eq(90000)
        await test.connect(sender).testSettleFlow(60000, tokenX.address)
        expect((await test.ethFlow())).to.eq(90000)
        await test.connect(sender).testSettleReserves(-20000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(70000)
        await test.connect(sender).testSettleFlow(-120000, ZERO_ADDR)
        expect((await test.ethFlow())).to.eq(-70000)

        // Make sure we haven't settled either in Ether or surplus
        expect((await test.getMyBalance())).to.equal(startTestBal + 0)
        expect((await test.getBalance(RECV_ADDR))).to.equal(startRecvBal + 0)
        expect((await test.testQuerySurplus(RECV_ADDR, ZERO_ADDR))).to.eq(0)

        // Should refund full amoutnt because it pays out of surplus
        await test.setFinal(true)
        await test.connect(sender).testSettleReserves(70000, ZERO_ADDR, {value: BigNumber.from(60000)})
        
        expect((await test.getMyBalance())).to.equal(startTestBal)
        expect((await test.getBalance(RECV_ADDR))).to.equal(startRecvBal + 60000)
        expect((await test.testQuerySurplus(RECV_ADDR, ZERO_ADDR))).to.eq(0)
    })
})
