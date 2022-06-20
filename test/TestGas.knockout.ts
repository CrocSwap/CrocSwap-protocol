import { TestPool, makeTokenPool, Token } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { ContractTransaction, BigNumber } from 'ethers';

chai.use(solidity);

// If set to true, every test will fail and therefore print the actual gas spend. 
const METRIC_PROFILE = false

describe('Gas Benchmarks', () => {
    let test: TestPool
    let initTx: Promise<ContractTransaction>
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
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

    it("swap cross full knockout [@gas-test]", async() => {
        await test.testMint(-10000, 10000, 10000)
        await test.testKnockoutMint(5000*1024, false, 32, 64, true)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)) // Warm up swap accum
        await expectGas(test.testSwapOther(true, true, 100000000, toSqrtPrice(1.008)), 162000)
    })

    it("swap cross end of knockout [@gas-test]", async() => {
        await test.testMint(-10000, 10000, 10000)
        await test.testKnockoutMint(5000*1024, false, 32, 64, true)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)) // Warm up swap accum
        await test.testSwapOther(true, true, 1000000, toSqrtPrice(1.004)) // Move into range of knockout range
        await expectGas(test.testSwapOther(true, true, 100000000, toSqrtPrice(1.008)), 145000)
    })

})
