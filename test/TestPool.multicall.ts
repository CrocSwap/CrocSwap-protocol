import { TestPool, makeTokenPool, Token, createWbera } from './FacadePool'
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
import { CrocSwapDex } from '../typechain/CrocSwapDex';
import { CrocQuery } from '../typechain/CrocQuery';
import { WBERA } from '../typechain';

chai.use(solidity);


describe('Pool Multi Path', () => {
    let test: TestPool
    let pool: CrocSwapDex
    let dex: string
    let oracle: MockCrocNonceOracle
    let query: CrocQuery
    let baseToken: Token
    let quoteToken: Token
    let sender: string
    let other: string
    let third: string
    let accts: Wallet[]
    const feeRate = 225 * 100
    const SALT = 2500
    const initBal = 100000
    let wbera: WBERA

    before(async () => {
        wbera = await createWbera()
    })
    beforeEach("deploy",  async () => {
       test = await makeTokenPool(wbera)
       baseToken = await test.base
       quoteToken = await test.quote

       sender = await (await test.trader).getAddress() 
       other = await (await test.other).getAddress() 
       third = await (await test.third).getAddress()
       pool = await test.dex
       query = await test.query
       dex = await test.dex.then(d => d.address)
       accts = (await (ethers.getSigners() as Promise<Signer[]>)) as unknown as Wallet[]

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = false;

       let factory = await ethers.getContractFactory("MockCrocNonceOracle")
       oracle = await (factory.deploy() as Promise<MockCrocNonceOracle>)

       await test.collectSurplus(accts[0].address, -initBal, 0)
    })

    function transferCmd (recv: string, value: number): BytesLike {
        let abiCoder = new ethers.utils.AbiCoder()
        return  abiCoder.encode(["uint8", "address", "int128", "address"],
            [75, recv, value, baseToken.address])
    }

    function depositEthCmd (recv: string, value: number): BytesLike {
        let abiCoder = new ethers.utils.AbiCoder()
        return  abiCoder.encode(["uint8", "address", "int128", "address"],
            [73, recv, value, ZERO_ADDR])
    }

    function oracleCmd (args: BytesLike): BytesLike {
        let abiCoder = new ethers.utils.AbiCoder()
        return  abiCoder.encode(["uint8", "address", "bytes"],
            [82, oracle.address, args])
    }

    it("two calls", async() => {
        // Because these transfer commands are context-dependent on the starting balance
        // this will verify path dependency of the multicall
        let cmd1 = transferCmd(accts[2].address, -10000)
        let cmd2 = transferCmd(accts[3].address, -1000)
        
        let abiCoder = new ethers.utils.AbiCoder()
        let multiCmd = abiCoder.encode(["uint8", "uint8", "bytes", "uint8", "bytes"],
            [2, test.COLD_PROXY, cmd1, test.COLD_PROXY, cmd2])

        await pool.userCmd(test.MULTI_PROXY, multiCmd)

        expect(await query.querySurplus(accts[2].address, baseToken.address)).to.equal(initBal-10000)
        expect(await query.querySurplus(accts[3].address, baseToken.address)).to.equal(10000-1000)        
    })

    it("three calls", async() => {
        // Because these transfer commands are context-dependent on the starting balance
        // this will verify path dependency of the multicall
        let cmd1 = transferCmd(accts[2].address, -10000)
        let cmd2 = transferCmd(accts[3].address, -1000)
        let cmd3 = transferCmd(accts[4].address, -100)
        
        let abiCoder = new ethers.utils.AbiCoder()
        let multiCmd = abiCoder.encode(["uint8", "uint8", "bytes", "uint8", "bytes", "uint8", "bytes"],
            [3, test.COLD_PROXY, cmd1, test.COLD_PROXY, cmd2, test.COLD_PROXY, cmd3])

        await pool.userCmd(test.MULTI_PROXY, multiCmd)

        expect(await query.querySurplus(accts[2].address, baseToken.address)).to.equal(initBal-10000)
        expect(await query.querySurplus(accts[3].address, baseToken.address)).to.equal(10000-1000)        
        expect(await query.querySurplus(accts[4].address, baseToken.address)).to.equal(1000-100)     
    })

    it("four calls", async() => {
        // Because these transfer commands are context-dependent on the starting balance
        // this will verify path dependency of the multicall
        let cmd1 = transferCmd(accts[2].address, -10000)
        let cmd2 = transferCmd(accts[3].address, -1000)
        let cmd3 = transferCmd(accts[4].address, -100)
        let cmd4 = transferCmd(accts[5].address, -10)
        
        let abiCoder = new ethers.utils.AbiCoder()
        let multiCmd = abiCoder.encode(["uint8", "uint8", "bytes", "uint8", "bytes", "uint8", "bytes", "uint8", "bytes"],
            [4, test.COLD_PROXY, cmd1, test.COLD_PROXY, cmd2, test.COLD_PROXY, cmd3, test.COLD_PROXY, cmd4])

        await pool.userCmd(test.MULTI_PROXY, multiCmd)

        expect(await query.querySurplus(accts[2].address, baseToken.address)).to.equal(initBal-10000)
        expect(await query.querySurplus(accts[3].address, baseToken.address)).to.equal(10000-1000)        
        expect(await query.querySurplus(accts[4].address, baseToken.address)).to.equal(1000-100)     
        expect(await query.querySurplus(accts[5].address, baseToken.address)).to.equal(100-10)     
    })

    it("five calls", async() => {
        // Because these transfer commands are context-dependent on the starting balance
        // this will verify path dependency of the multicall
        let cmd1 = transferCmd(accts[2].address, -10000)
        let cmd2 = transferCmd(accts[3].address, -1000)
        let cmd3 = transferCmd(accts[4].address, -100)
        let cmd4 = transferCmd(accts[5].address, -10)
        let cmd5 = transferCmd(accts[6].address, -1)
        
        let abiCoder = new ethers.utils.AbiCoder()
        let multiCmd = abiCoder.encode(["uint8", "uint8", "bytes", "uint8", "bytes", "uint8", "bytes", "uint8", "bytes", "uint8", "bytes"],
            [5, test.COLD_PROXY, cmd1, test.COLD_PROXY, cmd2, test.COLD_PROXY, cmd3, test.COLD_PROXY, cmd4, test.COLD_PROXY, cmd5])

        await pool.userCmd(test.MULTI_PROXY, multiCmd)

        expect(await query.querySurplus(accts[2].address, baseToken.address)).to.equal(initBal-10000)
        expect(await query.querySurplus(accts[3].address, baseToken.address)).to.equal(10000-1000)        
        expect(await query.querySurplus(accts[4].address, baseToken.address)).to.equal(1000-100)     
        expect(await query.querySurplus(accts[5].address, baseToken.address)).to.equal(100-10)     
        expect(await query.querySurplus(accts[6].address, baseToken.address)).to.equal(10-1)     
    })

    it("oracle cond", async() => {
        await oracle.setAccept(true)
        let cmd1 = transferCmd(accts[2].address, -10000)
        let cmd2 = transferCmd(accts[3].address, -1000)
        let cmdGate = oracleCmd("0x1234")
        
        let abiCoder = new ethers.utils.AbiCoder()
        let multiCmd = abiCoder.encode(["uint8", "uint8", "bytes", "uint8", "bytes", "uint8", "bytes"],
            [3, test.COLD_PROXY, cmdGate, test.COLD_PROXY, cmd1, test.COLD_PROXY, cmd2])

        await pool.userCmd(test.MULTI_PROXY, multiCmd)

        expect(await query.querySurplus(accts[2].address, baseToken.address)).to.equal(initBal-10000)
        expect(await query.querySurplus(accts[3].address, baseToken.address)).to.equal(10000-1000)  
        expect(await oracle.args_()).to.be.eq("0x1234")
        expect(await oracle.user_()).to.be.eq(sender)
    })

    it("oracle end", async() => {
        await oracle.setAccept(true)
        let cmd1 = transferCmd(accts[2].address, -10000)
        let cmd2 = transferCmd(accts[3].address, -1000)
        let cmdGate = oracleCmd("0x1234")
        
        let abiCoder = new ethers.utils.AbiCoder()
        let multiCmd = abiCoder.encode(["uint8", "uint8", "bytes", "uint8", "bytes", "uint8", "bytes"],
            [3, test.COLD_PROXY, cmd1, test.COLD_PROXY, cmd2, test.COLD_PROXY, cmdGate])

        await pool.userCmd(test.MULTI_PROXY, multiCmd)

        expect(await query.querySurplus(accts[2].address, baseToken.address)).to.equal(initBal-10000)
        expect(await query.querySurplus(accts[3].address, baseToken.address)).to.equal(10000-1000)  
        expect(await oracle.args_()).to.be.eq("0x1234")
        expect(await oracle.user_()).to.be.eq(sender)
    })

    it("oracle fail", async() => {
        await oracle.setAccept(false)
        let cmd1 = transferCmd(accts[2].address, -10000)
        let cmd2 = transferCmd(accts[3].address, -1000)
        let cmdGate = oracleCmd("0x1234")
        
        let abiCoder = new ethers.utils.AbiCoder()
        let multiCmd = abiCoder.encode(["uint8", "uint8", "bytes", "uint8", "bytes", "uint8", "bytes"],
            [3, test.COLD_PROXY, cmd1, test.COLD_PROXY, cmd2, test.COLD_PROXY, cmdGate])

        await expect(pool.userCmd(test.MULTI_PROXY, multiCmd)).to.be.reverted
    })

    it("double spend", async() => {
        await test.testDeposit(accts[0], accts[0].address, 10000000, ZERO_ADDR, { value: 10000000})

        let cmd1 = depositEthCmd(accts[2].address, 400000)
        let cmd2 = depositEthCmd(accts[3].address, 600000)

        let abiCoder = new ethers.utils.AbiCoder()
        let multiCmd = abiCoder.encode(["uint8", "uint8", "bytes", "uint8", "bytes"],
            [2, test.COLD_PROXY, cmd1, test.COLD_PROXY, cmd2])

        await expect(pool.userCmd(test.MULTI_PROXY, multiCmd)).to.be.reverted
        await expect(pool.userCmd(test.MULTI_PROXY, multiCmd, { value: 5000000})).to.be.reverted 
        await expect(pool.userCmd(test.MULTI_PROXY, multiCmd, { value: 6000000})).to.be.reverted 
        await expect(pool.userCmd(test.MULTI_PROXY, multiCmd, { value: 10000000})).to.be.reverted
        await expect(pool.userCmd(test.MULTI_PROXY, multiCmd, { value: 15000000})).to.be.reverted       
    })
})
