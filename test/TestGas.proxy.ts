import { TestPool, makeTokenPool, Token } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { ContractTransaction, BigNumber, ContractFactory } from 'ethers';
import { HotProxy } from '../contracts/test/typechain/HotProxy';

chai.use(solidity);

// If set to true, every test will fail and therefore print the actual gas spend. 
const METRIC_PROFILE = false

describe('Gas Benchmarks Proxy Sidecars', () => {
    let test: TestPool
    let initTx: Promise<ContractTransaction>
    const feeRate = 225 * 100
    let hotProxy: HotProxy

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       await test.fundTokens()

       let factory = await ethers.getContractFactory("HotProxy") as ContractFactory
       hotProxy = await factory.deploy() as HotProxy
       
       initTx = test.initPool(feeRate, 0, 1, 1.0)
       await initTx

       test.useHotPath = true
       await test.testUpgradeHotProxy(hotProxy.address, false)
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

    it("swap proxy unused [@gas-test]", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)), 109000)
    })

    it("swap proxy base [@gas-test]", async() => {
        test.useSwapProxy.base = true
        await test.testMint(-100, 100, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)), 116000)
    })

    it("swap proxy optimal - unforced [@gas-test]", async() => {
        test.useSwapProxy.base = true
        test.useSwapProxy.optimal = true
        await test.testMint(-100, 100, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)), 113000)
    })

    it("swap proxy optimal - forced [@gas-test]", async() => {
        await test.testUpgradeHotProxy(hotProxy.address, true)
        test.useSwapProxy.base = true
        test.useSwapProxy.optimal = true
        await test.testMint(-100, 100, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)), 116000)
    })
})
