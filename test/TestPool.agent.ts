import { TestPool, makeTokenPool, Token } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, ZERO_ADDR } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { MockCrocNonceOracle } from '../typechain/MockCrocNonceOracle';
import { BytesLike, Wallet, Signer, BigNumber, Transaction } from 'ethers';
import { AddressZero } from '@ethersproject/constants';

chai.use(solidity);

describe('Pool Router Agent', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    let sender: string
    let other: string
    let third: string
    const feeRate = 225 * 100
    const SALT = 2500

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       sender = await (await test.trader).getAddress() 
       other = await (await test.other).getAddress() 
       third = await (await test.third).getAddress()

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = false;
    })

    it("router agent", async() => {
        await test.collectSurplus(sender, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(sender, baseToken.address)
        let initBal = await baseToken.balanceOf(third)

        const nCalls = 500
        await test.testApproveRouter(await test.trader, other, nCalls, SALT)
        await test.testDisburseAgent(await test.other, sender, SALT, third, 5000, baseToken.address)

        // Test that deposit was made from the user's account, not from the router. 
        let nextBal = await baseToken.balanceOf(third)
        expect(nextBal.sub(initBal)).to.equal(5000)
        expect(await query.querySurplus(sender, baseToken.address)).to.equal(initSurplus.sub(5000))
      })  

    it("router not approved", async() => {
        await test.collectSurplus(sender, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(sender, baseToken.address)
        let initBal = await baseToken.balanceOf(other)
  
        await expect(test.testDisburseAgent(await test.other, sender, SALT, other, 0, baseToken.address)).to.be.reverted
      })

      it("router unnapproved party", async() => {
        await test.collectSurplus(sender, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(sender, baseToken.address)
        let initBal = await baseToken.balanceOf(other)
  
        const nCalls = 500
        await test.testApproveRouter(await test.trader, other, nCalls, SALT)
        await expect(test.testDisburseAgent(await test.third, sender, SALT, other, 0, baseToken.address)).to.be.reverted
      })
      
      it("router wrong salt", async() => {
        await test.collectSurplus(sender, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(sender, baseToken.address)
        let initBal = await baseToken.balanceOf(other)
  
        const nCalls = 500
        await test.testApproveRouter(await test.trader, other, nCalls, SALT)

        // This will fail because this router salt has zero nonces set
        await expect(test.testDisburseAgent(await test.other, sender, SALT+1, other, 0, baseToken.address)).to.be.reverted
      })
      
      it("router nonces", async() => {
        await test.collectSurplus(sender, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(sender, baseToken.address)
        let initBal = await baseToken.balanceOf(other)
  
        const nCalls = 20
        await test.testApproveRouter(await test.trader, other, nCalls, SALT)
        for (let i = 0; i < 20; ++i) {
            await test.testDisburseAgent(await test.other, sender, SALT, other, 10, baseToken.address)
        }

        // Runs out of nCall nonces
        await expect(test.testDisburseAgent(await test.other, sender, SALT, other, 0, baseToken.address)).to.be.reverted
      })

      it("router nonces reset", async() => {
        await test.collectSurplus(sender, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(sender, baseToken.address)
        let initBal = await baseToken.balanceOf(other)
  
        const nCalls = 20
        await test.testApproveRouter(await test.trader, other, nCalls, SALT)
        for (let i = 0; i < 10; ++i) {
            await test.testDisburseAgent(await test.other, sender, SALT, other, 10, baseToken.address)
        }

        // Resets nonce on this salt back to 20 calls
        await test.testApproveRouter(await test.trader, other, nCalls, SALT)
        for (let i = 0; i < 20; ++i) {
            await test.testDisburseAgent(await test.other, sender, SALT, other, 10, baseToken.address)
        }

        // Runs out of nCall nonces
        await expect(test.testDisburseAgent(await test.other, sender, SALT, other, 0, baseToken.address)).to.be.reverted
      })

      it("reset conditional", async() => {
        await test.collectSurplus(sender, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(sender, baseToken.address)
        let initBal = await baseToken.balanceOf(third)

        const nCalls = 500
        await test.testApproveRouter(await test.trader, other, nCalls, SALT)
        await test.testDisburseAgent(await test.other, sender, SALT, third, 5000, baseToken.address)

        // Test that deposit was made from the user's account, not from the router. 
        let nextBal = await baseToken.balanceOf(third)
        expect(nextBal.sub(initBal)).to.equal(5000)
        expect(await query.querySurplus(sender, baseToken.address)).to.equal(initSurplus.sub(5000))
      })  
})


describe('Pool Relayer Agent', () => {
    let test: TestPool
    let dex: string
    let oracle: MockCrocNonceOracle
    let baseToken: Token
    let quoteToken: Token
    let sender: string
    let other: string
    let third: string
    let accts: Wallet[]
    const feeRate = 225 * 100
    const SALT = 2500

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       sender = await (await test.trader).getAddress() 
       other = await (await test.other).getAddress() 
       third = await (await test.third).getAddress()
       dex = await test.dex.then(d => d.address)
       accts = (await (ethers.getSigners() as Promise<Signer[]>)) as unknown as Wallet[]

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = false;

       let factory = await ethers.getContractFactory("MockCrocNonceOracle")
       oracle = await (factory.deploy() as Promise<MockCrocNonceOracle>)
    })

    async function formSignature (callpath: number, cmd: BytesLike, conds: BytesLike, tip: BytesLike) {
        const domain = {
            name: "CrocSwap",
            chainId: 31337,
            verifyingContract: dex
        }

        const types = {
            CrocRelayerCall: [
                { name: "callpath", type: "uint8"},
                { name: "cmd", type: "bytes" },
                { name: "conds", type: "bytes" },
                { name: "tip", type: "bytes" }
            ]
        }

        const value = {
            callpath: callpath,
            cmd: cmd,
            conds: conds,
            tip: tip
        }
          
        const signature = (await (accts[0]._signTypedData(domain, types, value))).substring(2)
        
        const r = "0x" + signature.substring(0, 64);
        const s = "0x" + signature.substring(64, 128);
        const v = parseInt(signature.substring(128, 130), 16);

        let abiCoder = new ethers.utils.AbiCoder()
        return abiCoder.encode(["uint8", "bytes32", "bytes32"], [v, r, s])
    }

    function disburseCmd (recv: string, value: number): BytesLike {
        let abiCoder = new ethers.utils.AbiCoder()
        return  abiCoder.encode(["uint8", "address", "uint128", "address"],
            [74, recv, value, baseToken.address])
    }

    function resetNonceCmd (salt: number, nonce: number): BytesLike {
        let abiCoder = new ethers.utils.AbiCoder()
        return  abiCoder.encode(["uint8", "uint256", "uint32"],
            [80, salt, nonce])
    }

    function resetCondCmd (salt: number, nonce: number, args: string): BytesLike {
        let abiCoder = new ethers.utils.AbiCoder()
        return  abiCoder.encode(["uint8", "uint256", "uint32", "address", "bytes"],
            [81, salt, nonce, oracle.address, args])
    }

    function resetCondMiss (salt: number, nonce: number, args: string): BytesLike {
        let abiCoder = new ethers.utils.AbiCoder()
        return  abiCoder.encode(["uint8", "uint256", "uint32", "address", "bytes"],
            [81, salt, nonce, AddressZero, args])
    }

    function formCond (deadlineOff: number, aliveOff: number, nonce: number, salt: number, relayer: string) {
        let abiCoder = new ethers.utils.AbiCoder()
        let unixTime = Math.floor(Date.now() / 1000)
        return  abiCoder.encode(["uint48", "uint48", "uint256", "uint32", "address"],
            [unixTime + deadlineOff, unixTime + aliveOff, salt, nonce, relayer])
    }

    function formTip (tip: number, recv: string) {
        let abiCoder = new ethers.utils.AbiCoder()
        return  abiCoder.encode(["address", "uint128", "address"],
            [baseToken.address, tip, recv])
    }

    it("relay call", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)
        let initBal = await baseToken.balanceOf(other)

        const SALT = 15
       let cmd = disburseCmd(other, 5000)
       let cond = formCond(10000, -10000, 0, SALT, AddressZero)
       let tip = formTip(0, other)
       let signature = await formSignature(test.COLD_PROXY, cmd, cond, tip)
       
       await pool.userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)

       let nextBal = await baseToken.balanceOf(other)
       expect(nextBal.sub(initBal)).to.equal(5000)
       expect(await query.querySurplus(accts[0].address, baseToken.address)).to.equal(initSurplus.sub(5000))
    }) 

    it("nonce no repeat", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)
        let initBal = await baseToken.balanceOf(other)

       let cmd = disburseCmd(other, 5000)
       let cond = formCond(10000, -10000, 0, 0, AddressZero)
       let tip = formTip(0, other)
       let signature = await formSignature(test.COLD_PROXY, cmd, cond, tip)
       
       await pool.userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)
       await expect(pool.userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)).to.be.reverted
    })

    it("nonce sequence", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)
        let initBal = await baseToken.balanceOf(other)

        const SALT = 15
       let cmd = disburseCmd(other, 5000)
       let cmdTwo = disburseCmd(other, 15000)
       let cond = formCond(10000, -10000, 0, SALT, AddressZero)
       let condTwo = formCond(10000, -10000, 1, SALT, AddressZero)       
       let tip = formTip(0, other)
       let signature = await formSignature(test.COLD_PROXY, cmd, cond, tip)
       let sigTwo = await formSignature(test.COLD_PROXY, cmdTwo, condTwo, tip)
       
       await pool.userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)
       await pool.userCmdRelayer(test.COLD_PROXY, cmdTwo, condTwo, tip, sigTwo)

       let nextBal = await baseToken.balanceOf(other)
       expect(nextBal.sub(initBal)).to.equal(20000)
       expect(await query.querySurplus(accts[0].address, baseToken.address)).to.equal(initSurplus.sub(20000))
    }) 

    it("relayer address", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)
        let initBal = await baseToken.balanceOf(other)

       let cmd = disburseCmd(other, 5000)
       let cond = formCond(10000, -10000, 0, 0, sender)
       let tip = formTip(0, other)
       let signature = await formSignature(test.COLD_PROXY, cmd, cond, tip)
       
       await pool.userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)

       let nextBal = await baseToken.balanceOf(other)
       expect(nextBal.sub(initBal)).to.equal(5000)
       expect(await query.querySurplus(accts[0].address, baseToken.address)).to.equal(initSurplus.sub(5000))
    }) 

    it("unauthorized relayer", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)
        let initBal = await baseToken.balanceOf(other)

       let cmd = disburseCmd(other, 5000)
       let cond = formCond(10000, -10000, 0, 0, other) // Requires relayer to come from other addres
       let tip = formTip(0, other)
       let signature = await formSignature(test.COLD_PROXY, cmd, cond, tip)
       
       // Comes from sender, and therefore fails the relayer origin condition
       await expect(pool.userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)).to.be.reverted
    }) 
    
    it("deadline", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)
        let initBal = await baseToken.balanceOf(other)

       let cmd = disburseCmd(other, 5000)
       let cond = formCond(-10000, 0, 0, 0, AddressZero)
       let tip = formTip(0, other)
       let signature = await formSignature(test.COLD_PROXY, cmd, cond, tip)
       
        await expect(pool.userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)).to.be.reverted
    })  

    it("live time condition", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)
        let initBal = await baseToken.balanceOf(other)

       let cmd = disburseCmd(other, 5000)
       let cond = formCond(10000, 5000, 0, 0, AddressZero)
       let tip = formTip(0, other)
       let signature = await formSignature(test.COLD_PROXY, cmd, cond, tip)
       
        await expect(pool.userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)).to.be.reverted
    })  

    it("nonce reset", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)
        let initBal = await baseToken.balanceOf(other)

        const SALT = 5000
        const NONCE = 100
        await pool.connect(accts[0]).userCmd(test.COLD_PROXY, resetNonceCmd(SALT, NONCE))

       let cmd = disburseCmd(other, 5000)
       let cond = formCond(10000, -10000, NONCE, SALT, AddressZero)
       let tip = formTip(0, other)
       let signature = await formSignature(test.COLD_PROXY, cmd, cond, tip)
       
       await pool.userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)

       let nextBal = await baseToken.balanceOf(other)
       expect(nextBal.sub(initBal)).to.equal(5000)
       expect(await query.querySurplus(accts[0].address, baseToken.address)).to.equal(initSurplus.sub(5000))
    }) 

    it("nonce reset wrong", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)
        let initBal = await baseToken.balanceOf(other)

        const SALT = 5000
        const NONCE = 100
        await pool.connect(accts[0]).userCmd(test.COLD_PROXY, resetNonceCmd(SALT, NONCE))

       let cmd = disburseCmd(other, 5000)
       let cond = formCond(10000, -10000, NONCE-10, SALT, AddressZero)
       let tip = formTip(0, other)
       let signature = await formSignature(test.COLD_PROXY, cmd, cond, tip)
       
       await expect(pool.userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)).to.be.reverted
    }) 

    it("nonce reset cond", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)
        let initBal = await baseToken.balanceOf(other)

        const SALT = 5000
        const NONCE = 100
        await oracle.setAccept(true)
        await pool.connect(accts[0]).userCmd(test.COLD_PROXY, resetCondCmd(SALT, NONCE, "0x1234"))

       let cmd = disburseCmd(other, 5000)
       let cond = formCond(10000, -10000, NONCE, SALT, AddressZero)
       let tip = formTip(0, other)
       let signature = await formSignature(test.COLD_PROXY, cmd, cond, tip)
       
       await pool.userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)

       let nextBal = await baseToken.balanceOf(other)
       expect(nextBal.sub(initBal)).to.equal(5000)
       expect(await query.querySurplus(accts[0].address, baseToken.address)).to.equal(initSurplus.sub(5000))
    }) 

    it("nonce reset cond mock args", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)
        let initBal = await baseToken.balanceOf(other)

        const SALT = 5000
        const NONCE = 100
        await oracle.setAccept(true)
        await pool.connect(accts[0]).userCmd(test.COLD_PROXY, resetCondCmd(SALT, NONCE, "0x1234"))

        expect(await oracle.user_()).to.be.eq(accts[0].address)
        expect(await oracle.nonce_()).to.be.eq(100)
        expect(BigNumber.from(await oracle.salt_())).to.be.eq(SALT)
        expect(await oracle.args_()).to.be.eq("0x1234")
    }) 

    it("reset cond reject", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)
        let initBal = await baseToken.balanceOf(other)

        const SALT = 5000
        const NONCE = 100
        await oracle.setAccept(false)
        await expect(pool.connect(accts[0]).userCmd(test.COLD_PROXY, resetCondCmd(SALT, NONCE, "0x1234"))).to.be.reverted
    }) 

    it("reset cond bad oracle", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)
        let initBal = await baseToken.balanceOf(other)

        const SALT = 5000
        const NONCE = 100
        await oracle.setAccept(false)
        await expect(pool.connect(accts[0]).userCmd(test.COLD_PROXY, resetCondMiss(SALT, NONCE, "0x1234"))).to.be.reverted
    }) 

    it("relayer tip", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)

        const SALT = 15
       let cmd = disburseCmd(other, 5000)
       let cond = formCond(10000, -1000, 0, SALT, AddressZero)
       let tip = formTip(8500, third)
       let signature = await formSignature(test.COLD_PROXY, cmd, cond, tip)
       
       await pool.userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)

       // Tip gets paid to the specified recipient in the specified amount
       expect(await query.querySurplus(third, baseToken.address)).to.equal(8500)
       expect(await query.querySurplus(accts[0].address, baseToken.address)).to.equal(initSurplus.sub(5000+8500))
    }) 

    it("tip sender", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(third, baseToken.address)

        // This will tip whatever relayer sends the dex call
        const MAGIC_SENDER = "0x0000000000000000000000000000000000000100"

        const SALT = 15
       let cmd = disburseCmd(other, 5000)
       let cond = formCond(10000, -10000, 0, SALT, AddressZero)
       let tip = formTip(8500, MAGIC_SENDER)
       let signature = await formSignature(test.COLD_PROXY, cmd, cond, tip)
       
       await pool.connect(await test.third).userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)
       expect(await query.querySurplus(third, baseToken.address)).to.equal(initSurplus.add(8500))
    }) 

    it("tip origin", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(third, baseToken.address)

        // This will tip whatever relayer is the tx.origin of the transaction
        const MAGIC_SENDER = "0x0000000000000000000000000000000000000200"

        const SALT = 15
       let cmd = disburseCmd(other, 5000)
       let cond = formCond(10000, -10000, 0, SALT, AddressZero)
       let tip = formTip(8500, MAGIC_SENDER)
       let signature = await formSignature(test.COLD_PROXY, cmd, cond, tip)
       
       await pool.connect(await test.third).userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)
       expect(await query.querySurplus(third, baseToken.address)).to.equal(initSurplus.add(8500))
    }) 


    async function setTakeRate (rate: number): Promise<Transaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "uint8"], [116, rate])
        return (await test.dex).connect(await test.auth).protocolCmd(test.COLD_PROXY, cmd, false)
    }

    it("tip protocol take", async() => {
        await test.collectSurplus(accts[0].address, -100000, -2500000)

        let pool = await test.dex
        let query = await test.query
        let initSurplus = await query.querySurplus(accts[0].address, baseToken.address)

        // Take rate is in 1/256, so this is equivlent to 25% take rate
        await setTakeRate(64)

        const SALT = 15
       let cmd = disburseCmd(other, 5000)
       let cond = formCond(10000, -10000, 0, SALT, AddressZero)
       let tip = formTip(8000, third)
       let signature = await formSignature(test.COLD_PROXY, cmd, cond, tip)
       
       await pool.userCmdRelayer(test.COLD_PROXY, cmd, cond, tip, signature)

       // Relayer receives 75% of the tip, protocol receives 25%
       expect(await query.querySurplus(third, baseToken.address)).to.equal(6000)
       expect(await query.queryProtocolAccum(baseToken.address)).to.equal(2000)
    }) 
})
