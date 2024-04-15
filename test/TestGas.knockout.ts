import { TestPool, makeTokenPool, Token, createWbera } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { ContractTransaction, BigNumber } from 'ethers';
import { WBERA } from '../typechain';

chai.use(solidity);

// If set to true, every test will fail and therefore print the actual gas spend. 
const METRIC_PROFILE = false

describe('Gas Benchmarks Knockout', () => {
    let test: TestPool
    let initTx: Promise<ContractTransaction>
    const feeRate = 225 * 100
    let wbera: WBERA

    before(async () => {
        wbera = await createWbera()
    })

    beforeEach("deploy",  async () => {
       test = await makeTokenPool(wbera)
       await test.fundTokens()

       initTx = test.initPool(feeRate, 0, 1, 1.0)
       await initTx

       test.useHotPath = true
       const knockoutFlag = 64 + 32 + 5 // Enabled, on grid, 32-ticks wide
       await test.testRevisePool(feeRate, 0, 1, 0, knockoutFlag)
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

    it("mint knockout", async() => {
        await test.testMint(-10000, 10000, 10000)
        await test.testMint(-100, 100, 10000)
        await expectGas(test.testKnockoutMint(5000*1024, false, 32, 64, true), 228000)
    })

    it("mint knockout pre-init pivot", async() => {
        await test.testMint(-10000, 10000, 10000)
        await test.testMint(-100, 100, 10000)
        await test.testKnockoutMint(5000*1024, false, 32, 64, true)
        await expectGas(test.testKnockoutMint(5000*1024, false, 32, 64, true), 111000)
    })

    it("swap cross full knockout [@gas-test]", async() => {
        await test.testMint(-10000, 10000, 10000)
        await test.testKnockoutMint(5000*1024, false, 32, 64, true)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)) // Warm up swap accum
        await expectGas(test.testSwapOther(true, true, 100000000, toSqrtPrice(1.008)), 178000)
    })

    it("swap cross end of knockout [@gas-test]", async() => {
        await test.testMint(-10000, 10000, 10000)
        await test.testKnockoutMint(5000*1024, false, 32, 64, true)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)) // Warm up swap accum
        await test.testSwapOther(true, true, 1000000, toSqrtPrice(1.004)) // Move into range of knockout range
        await expectGas(test.testSwapOther(true, true, 100000000, toSqrtPrice(1.008)), 160000)
    })

})
