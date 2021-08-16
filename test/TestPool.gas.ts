import { TestPool } from '../typechain/TestPool'
import { MockFactory } from '../typechain/MockFactory'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, toFixedGrowth } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { CrocSwapPool } from '../typechain/CrocSwapPool';
import { ContractTransaction, BigNumber } from 'ethers';

chai.use(solidity);

// If set to true, every test will fail and therefore print the actual gas spend. 
const METRIC_PROFILE = false

describe('Pool', () => {
    let pool: CrocSwapPool
    let test: TestPool
    let test2: TestPool
    let baseToken: MockERC20
    let quoteToken: MockERC20
    let offToken: MockERC20
    let poolFactory: MockFactory
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       let factory = await ethers.getContractFactory("MockERC20")
       baseToken = await factory.deploy() as MockERC20
       quoteToken = await factory.deploy() as MockERC20
       offToken = await factory.deploy() as MockERC20

       let baseAddr = baseToken.address
       let quoteAddr = quoteToken.address
       
       factory = await ethers.getContractFactory("MockFactory")
       poolFactory = await factory.deploy() as MockFactory

       await poolFactory.createPool(quoteAddr, baseAddr, feeRate)
       let poolAddr = await poolFactory.getPool(quoteAddr, baseAddr, feeRate)
       factory = await ethers.getContractFactory("TestPool")
       test = await factory.deploy(poolAddr, quoteAddr, baseAddr) as TestPool
       test2 = await factory.deploy(poolAddr, quoteAddr, baseAddr) as TestPool
       await test.turnOnGasMode();
       await test2.turnOnGasMode();

       factory = await ethers.getContractFactory("CrocSwapPool")
       pool = await factory.attach(poolAddr) as CrocSwapPool
       
       await baseToken.deposit(test.address, 100000000);
       await quoteToken.deposit(test.address, 100000000); 
       await baseToken.deposit(test2.address, 100000000);
       await quoteToken.deposit(test2.address, 100000000);     
       await pool.initialize(toSqrtPrice(1.0))    
    })

    async function gasUsed (tx: Promise<ContractTransaction>): Promise<BigNumber> {
        return tx
            .then(t => t.wait())
            .then(t => t.gasUsed)
    }

    async function expectGas (tx: Promise<ContractTransaction>, limit: number) {
        let gas = await gasUsed(tx)
        let comp = METRIC_PROFILE ? 0 : limit
        expect(gas).to.be.lt(comp)
    }

    it("create pool", async() => {
        await expectGas(poolFactory.createPool
            (offToken.address, baseToken.address, feeRate), 3500000)
    })

    it("mint in virgin pool", async() => {
        await expectGas(test.testMint(-100, 100, 10000), 340000)
    })

    it("mint increase liq", async() => {
        await test.testMint(-100, 100, 10000)
        await expectGas(test.testMint(-100, 100, 10000), 140000)
    })

    it("mint pre-init ticks", async() => {
        await test.testMint(-100, 100, 10000)
        await expectGas(test2.testMint(-100, 100, 10000), 155000)
    })

    it("mint one fresh init", async() => {
        await test.testMint(-100, 100, 10000)
        await expectGas(test2.testMint(-100, 200, 10000), 175000)
    })

    it("mint fresh ticks", async() => {
        await test.testMint(-100, 100, 10000)
        await expectGas(test2.testMint(-200, 200, 10000), 195000)
    })

    it("mint below price", async() => {
        await test.testMint(-100, 100, 10000)
        await expectGas(test2.testMint(-300, -200, 10000), 185000)
    })

    it("mint above price", async() => {
        await test.testMint(-100, 100, 10000)
        await expectGas(test2.testMint(200, 300, 10000), 185000)
    })

    it("burn partial", async() => {
        await test.testMint(-100, 100, 10000)
        await expectGas(test.testBurn(-100, 100, 5000), 108000)
    })

    it("burn partial level left", async() => {
        await test.testMint(-100, 100, 10000)
        await test2.testMint(-100, 100, 10000)
        await expectGas(test.testBurn(-100, 100, 5000), 108000)
    })

    it("burn full", async() => {
        await test.testMint(-100, 100, 10000)
        await expectGas(test.testBurn(-100, 100, 10000), 79000)
    })

    it("burn full level left", async() => {
        await test.testMint(-100, 100, 10000)
        await test2.testMint(-100, 100, 10000)
        await expectGas(test.testBurn(-100, 100, 10000), 93000)
    })

    it("burn outside", async() => {
        await test.testMint(-200, -100, 10000)
        await expectGas(test.testBurn(-200, -100, 10000), 63000)
    })

    it("burn outside left", async() => {
        await test.testMint(-200, -100, 10000)
        await test2.testMint(-200, -100, 10000)
        await expectGas(test.testBurn(-200, -100, 10000), 72000)
    })

    it("burn liq rewards", async() => {
        await test.testMint(-100, 100, 10000000)
        await test2.testSwap(false, 1000, toSqrtPrice(1.1))
        await expectGas(test.testBurn(-100, 100, 10000), 129000)
    })

    it("burn liq level left", async() => {
        await test.testMint(-100, 100, 10000000)
        await test2.testMint(-100, 100, 10000000)
        await test2.testSwap(false, 1000, toSqrtPrice(1.1))
        await expectGas(test.testBurn(-100, 100, 10000), 129000)
    })

    it("burn flipped", async() => {
        await test.testMint(-100, 100, 10000000)
        await test2.testSwap(false, 1000000, toSqrtPrice(1.1))
        await expectGas(test.testBurn(-100, 100, 10000), 107000)
    })

    it("burn flipped level left", async() => {
        await test.testMint(-100, 100, 10000000)
        await test2.testMint(-100, 100, 10000000)
        await test2.testSwap(false, 1000000, toSqrtPrice(1.1))
        await expectGas(test.testBurn(-100, 100, 10000), 107000)
    })

    it("swap no pre-warm", async() => {
        await test.testMint(-100, 100, 1000000)
        await expectGas(test2.testSwap(false, 1000, toSqrtPrice(1.1)), 157000)
        expect(await pool.liquidity()).to.be.gt(100000)
    })

    it("swap small", async() => {
        await test.testMint(-100, 100, 1000000)
        await test2.testSwap(false, 1000, toSqrtPrice(1.1))
        await expectGas(test2.testSwap(false, 1000, toSqrtPrice(1.1)), 122000)
        expect(await pool.liquidity()).to.be.gt(100000)
    })

    it("swap tick w/o cross", async() => {
        await test.testMint(-100, 100, 1000000)
        await test2.testSwap(false, 1000, toSqrtPrice(1.0005))
        await expectGas(test2.testSwap(false, 10000000, toSqrtPrice(1.005)), 122000)
        expect(await pool.liquidity()).to.be.gt(100000)
    })

    it("swap spill w/o cross", async() => {
        await test.testMint(-500, 500, 1000000)
        await test2.testSwap(false, 1000, toSqrtPrice(1.1))
        await expectGas(test2.testSwap(false, 10000000, toSqrtPrice(1.04)), 174000)
        expect(await pool.liquidity()).to.be.gt(100000)
    })

    it("swap cross tick", async() => {
        await test.testMint(-100, 100, 1000000)
        await test.testMint(-500, 500, 1000000)
        await test2.testSwap(false, 1000, toSqrtPrice(1.1))
        await expectGas(test2.testSwap(false, 1000000, toSqrtPrice(1.04)), 215000)
        expect(await pool.liquidity()).to.be.lt(1010000)
        expect(await pool.liquidity()).to.be.gt(1000000)
    })

    it("swap cross two tick", async() => {
        await test.testMint(-100, 100, 1000000)
        await test.testMint(-200, 200, 1000000)
        await test.testMint(-500, 500, 1000000)
        await test2.testSwap(false, 1000, toSqrtPrice(1.1))

        await expectGas(test2.testSwap(false, 2000000, toSqrtPrice(1.04)), 257000)
        expect(await pool.liquidity()).to.be.lt(1010000)
        expect(await pool.liquidity()).to.be.gt(1000000)
    })

    it("swap cross many ticks", async() => {
        await test.testMint(-100, 100, 1000000)
        await test.testMint(-200, 200, 100000)
        await test.testMint(-200, 210, 100000)
        await test.testMint(-200, 220, 100000)
        await test.testMint(-200, 250, 100000)
        await test.testMint(-200, 280, 100000)
        await test.testMint(-200, 300, 100000)
        await test.testMint(-500, 500, 100000)
        await test2.testSwap(false, 1000, toSqrtPrice(1.1))

        await expectGas(test2.testSwap(false, 2000000, toSqrtPrice(1.04)), 463000)
        expect(await pool.liquidity()).to.be.lt(101000)
        expect(await pool.liquidity()).to.be.gt(100000)
    })
})
