import { TestPool } from '../typechain/TestPool'
import { MockFactory } from '../typechain/MockFactory'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, MIN_TICK, MAX_TICK } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { CrocSwapPool } from '../typechain/CrocSwapPool';

chai.use(solidity);

describe('Pool Security', () => {
    let pool: CrocSwapPool
    let test: TestPool
    let test2: TestPool
    let baseToken: MockERC20
    let quoteToken: MockERC20
    let poolFactory: MockFactory
    const treasury: string = "0x0000000000000000000000000000000000000019"

    beforeEach("deploy",  async () => {
       let factory = await ethers.getContractFactory("MockERC20")
       baseToken = await factory.deploy() as MockERC20
       quoteToken = await factory.deploy() as MockERC20

       let baseAddr = baseToken.address
       let quoteAddr = quoteToken.address
       
       factory = await ethers.getContractFactory("MockFactory")
       poolFactory = await factory.deploy() as MockFactory

       await poolFactory.createPool(quoteAddr, baseAddr, 0)
       let poolAddr = await poolFactory.getPool(quoteAddr, baseAddr, 0)
       factory = await ethers.getContractFactory("TestPool")
       test = await factory.deploy(poolAddr, quoteAddr, baseAddr) as TestPool
       test2 = await factory.deploy(poolAddr, quoteAddr, baseAddr) as TestPool

       factory = await ethers.getContractFactory("CrocSwapPool")
       pool = await factory.attach(poolAddr) as CrocSwapPool
       
       await baseToken.deposit(test.address, 100000000);
       await quoteToken.deposit(test.address, 100000000); 
       await baseToken.deposit(test2.address, 100000000);
       await quoteToken.deposit(test2.address, 100000000); 
    })

    it("double initialize", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        expect(pool.initialize(toSqrtPrice(1.5))).to.reverted
        expect(pool.initialize(toSqrtPrice(0.5))).to.reverted
        expect(pool.initialize(toSqrtPrice(2.5))).to.reverted
    })

    it("pre-initialize", async() => {
        expect(test.testMint(-100, 100, 10000)).to.be.reverted
        expect(test.testSwap(true, 100, toSqrtPrice(2.0))).to.be.reverted
        expect(test.testSwap(false, 100, toSqrtPrice(2.0))).to.be.reverted
        expect(test.testBurn(-100, 100, 10000)).to.be.reverted
    })

    it("mint outside tick range", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        expect(test.testMint(MIN_TICK-1, 0, 100000)).to.be.reverted
        expect(test.testMint(0, MAX_TICK+1, 100000)).to.be.reverted
        await test.testMint(MIN_TICK, MAX_TICK, 100000)
    })

    it("over burn", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-100, 100, 10000);
        await test.testMint(5000, 6000, 20000);
        await test.testMint(3000, 5000, 30000);

        expect(test.testBurn(-100, 100, 10001)).to.reverted
        expect(test.testBurn(3000, 5000, 35000)).to.reverted
        expect(test.testBurn(5000, 6000, 21000)).to.reverted
        
        await test.testBurn(-100, 100, 8000)
        await test.testBurn(5000, 6000, 20000)
        await test.testBurn(3000, 5000, 1000)
        expect(test.testBurn(-100, 100, 2001)).to.reverted
        expect(test.testBurn(3000, 5000, 29100)).to.reverted
        expect(test.testBurn(5000, 6000, 1)).to.reverted
        expect(test.testBurn(-101, 100, 1000)).to.reverted        
        expect(test.testBurn(-100, 101, 1000)).to.reverted
    })

    it("burn steal", async() => {
        await pool.initialize(toSqrtPrice(1.5))
        await test.testMint(-100, 100, 10000);
        await test.testMint(5000, 6000, 20000);
        await test.testMint(3000, 5000, 30000);

        expect(test.testBurn(-100, 100, 10001)).to.reverted
        expect(test.testBurn(3000, 5000, 35000)).to.reverted
        expect(test.testBurn(5000, 6000, 21000)).to.reverted
        
        expect(test2.testBurn(-100, 100, 1000)).to.reverted
        expect(test2.testBurn(3000, 5000, 5000)).to.reverted
        expect(test2.testBurn(5000, 6000, 1)).to.reverted

        await test2.testMint(3000, 5000, 6000)
        expect(test2.testBurn(5000, 6000, 6001)).to.reverted
        expect(test.testBurn(5000, 6000, 31000)).to.reverted
    })

    it("protocol auth", async() => {
        await poolFactory.setOwner(test.address)
        expect(test2.testProtocolSetFee(5)).to.be.reverted
        expect(test2.testProtocolCollect(treasury)).to.be.reverted

        await test.testProtocolSetFee(5)
        await test.testProtocolCollect(treasury)
    })

    /* Reentrancy checks */
})