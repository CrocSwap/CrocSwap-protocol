import { TestPool, makeTokenPool, Token, createWbera } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { ContractTransaction, BigNumber, ContractFactory } from 'ethers';
import { HotProxy } from '../typechain/HotProxy';
import { WBERA } from '../typechain';

chai.use(solidity);

// If set to true, every test will fail and therefore print the actual gas spend. 
const METRIC_PROFILE = false

describe('Gas Benchmarks Proxy Sidecars', () => {
    let test: TestPool
    let initTx: Promise<ContractTransaction>
    const feeRate = 225 * 100
    let hotProxy: HotProxy

    let wbera: WBERA

    before(async () => {
        wbera = await createWbera()
    })

    beforeEach("deploy",  async () => {
       test = await makeTokenPool(wbera)
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
        await expectGas(test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)), 116000)
    })

    it("swap proxy optimal - forced [@gas-test]", async() => {
        await test.testUpgradeHotProxy(hotProxy.address, true)
        test.useSwapProxy.base = true
        test.useSwapProxy.optimal = true
        await test.testMint(-100, 100, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)), 116000)
    })

    it("swap proxy router [@gas-test]", async() => {
        await test.testUpgradeHotProxy(hotProxy.address, true)
        await test.base.approve(await test.other, (await test.router).address, 100000000000)
        await test.quote.approve(await test.other, (await test.router).address, 100000000000)
 
        test.useSwapProxy.router = true
        await test.testMint(-100, 100, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)), 180000)
    })

    it("swap proxy bypass router [@gas-test]", async() => {
        await test.testUpgradeHotProxy(hotProxy.address, true)
        await test.testApproveRouter(await test.other, (await test.routerBypass).address, 
            100000000, [test.HOT_PROXY])

        test.useSwapProxy.bypass = true
        await test.testMint(-100, 100, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)), 126000)
    })
})
