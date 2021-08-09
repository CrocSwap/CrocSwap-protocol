import { TestPool } from '../typechain/TestPool'
import { MockFactory } from '../typechain/MockFactory'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { CrocSwapPool } from '../typechain/CrocSwapPool';

chai.use(solidity);

describe('Pool Externals', () => {
    let pool: CrocSwapPool
    let test: TestPool
    let baseToken: MockERC20
    let quoteToken: MockERC20
    let poolFactory: MockFactory
    const treasury: string = "0x0000000000000000000000000000000000000019"
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       let factory = await ethers.getContractFactory("MockERC20")
       baseToken = await factory.deploy() as MockERC20
       quoteToken = await factory.deploy() as MockERC20

       let baseAddr = baseToken.address
       let quoteAddr = quoteToken.address
       
       factory = await ethers.getContractFactory("MockFactory")
       poolFactory = await factory.deploy() as MockFactory

       await poolFactory.createPool(quoteAddr, baseAddr, feeRate)
       let poolAddr = await poolFactory.getPool(quoteAddr, baseAddr, feeRate)
       factory = await ethers.getContractFactory("TestPool")
       test = await factory.deploy(poolAddr, quoteAddr, baseAddr) as TestPool

       factory = await ethers.getContractFactory("CrocSwapPool")
       pool = await factory.attach(poolAddr) as CrocSwapPool
       
       await baseToken.deposit(test.address, 100000000);
       await quoteToken.deposit(test.address, 100000000); 
    })

    it("mint arrears base", async() => {
        // Pre-collateralize the pool to make sure we collect on the delta
        await baseToken.deposit(pool.address, 30000);
        await quoteToken.deposit(pool.address, 30000);
        await test.setDebtHaircut(0, 1)
        
        await pool.initialize(toSqrtPrice(1.5))
        expect(test.testMint(-100, 100, 10000)).to.be.reverted
        expect(test.testMint(-5000, 8000, 10000)).to.be.reverted
        expect(await quoteToken.balanceOf(pool.address)).to.equal(30000)
        expect(await baseToken.balanceOf(pool.address)).to.equal(30000)

        expect(test.testMint(5000, 6000, 1000)).to.be.not.reverted
        expect(await quoteToken.balanceOf(pool.address)).to.gt(30000)
        expect(await baseToken.balanceOf(pool.address)).to.equal(30000)
    })

    it("mint arrears quote", async() => {
        // Pre-collateralize the pool to make sure we collect on the delta
        await baseToken.deposit(pool.address, 30000);
        await quoteToken.deposit(pool.address, 30000);
        await test.setDebtHaircut(1, 0)
        
        await pool.initialize(toSqrtPrice(1.5))
        expect(test.testMint(5000, 6000, 10000)).to.be.reverted
        expect(test.testMint(-5000, 8000, 10000)).to.be.reverted
        expect(await quoteToken.balanceOf(pool.address)).to.equal(30000)
        expect(await baseToken.balanceOf(pool.address)).to.equal(30000)

        expect(test.testMint(-100, 100, 1000)).to.be.not.reverted
        expect(await quoteToken.balanceOf(pool.address)).to.equal(30000)
        expect(await baseToken.balanceOf(pool.address)).to.gt(30000)
    })

    it("mint emit log", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        expect(test.testMint(-100, 100, 10000)).to.emit(pool, "Mint")
    })

    it("mint calldata", async() => {
        let calldata = [5, 6, 7]
        await test.setCalldata(calldata);
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-100, 100, 10000)
        expect(await test.snapCalldata()).to.equal("0x050607")
    })


    it("swap arrears base", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000);         

        await test.setDebtHaircut(1, 0)
        expect(test.testSwap(true, -10000, toSqrtPrice(1.25))).to.be.reverted
        expect(test.testSwap(true, 10000, toSqrtPrice(1.25))).to.be.reverted
        expect(test.testSwap(false, -10000, toSqrtPrice(2.0))).to.be.not.reverted
        expect(test.testSwap(false, 10000, toSqrtPrice(2.0))).to.be.not.reverted
    })

    it("swap arrears base", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000);         

        await test.setDebtHaircut(0, 1)
        expect(test.testSwap(false, -10000, toSqrtPrice(2.0))).to.be.reverted
        expect(test.testSwap(false, 10000, toSqrtPrice(2.0))).to.be.reverted
        expect(test.testSwap(true, -10000, toSqrtPrice(1.25))).to.be.not.reverted
        expect(test.testSwap(true, 10000, toSqrtPrice(1.25))).to.be.not.reverted
    })

    it("swap emit log", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        expect(test.testSwap(true, -10000, toSqrtPrice(1.25))).to.emit(pool, "Swap")
    })

    it("swap calldata", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 

        let calldata = [5, 6, 7]
        await test.setCalldata(calldata);
        expect(test.testSwap(true, -10000, toSqrtPrice(1.25))).to.emit(pool, "Swap")
        expect(await test.snapCalldata()).to.equal("0x050607")
    })

    it("burn emit log", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-100, 100, 10000)
        expect(test.testBurn(-100, 100, 10000)).to.emit(pool, "Burn")
    })

    it("protocol disburse", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        await poolFactory.setOwner(test.address)
        await test.testProtocolSetFee(6)
        await test.testSwap(true, 10000, 2.0)

        await test.testProtocolCollect(treasury)
        expect(await quoteToken.balanceOf(treasury)).to.equal(0)
        expect(await baseToken.balanceOf(treasury)).to.equal(55)
    })

    it("protocol two side", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        await poolFactory.setOwner(test.address)
        await test.testProtocolSetFee(6)
        await test.testSwap(true, 10000, 2.0)
        await test.testSwap(true, -10000, 2.0)        

        await test.testProtocolCollect(treasury)
        expect(await quoteToken.balanceOf(treasury)).to.equal(25)
        expect(await baseToken.balanceOf(treasury)).to.equal(55)
    })

    it("protocol idempotent", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-5000, 8000, 1000000); 
        await poolFactory.setOwner(test.address)
        await test.testProtocolSetFee(6)
        await test.testSwap(true, 10000, 2.0)
        await test.testSwap(true, -10000, 2.0)        
        await test.testSwap(false, 10000, 1.0)

        await test.testProtocolCollect(treasury)
        expect(await quoteToken.balanceOf(treasury)).to.equal(25)
        expect(await baseToken.balanceOf(treasury)).to.equal(55)

        await test.testProtocolCollect(treasury)
        expect(await quoteToken.balanceOf(treasury)).to.equal(25)
        expect(await baseToken.balanceOf(treasury)).to.equal(55)
    })

    it("burn emit log", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await poolFactory.setOwner(test.address)
        expect(test.testProtocolCollect(treasury)).to.emit(pool, "CollectProtocol")
    })
})