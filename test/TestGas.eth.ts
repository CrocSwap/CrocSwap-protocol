import { TestPool, makeTokenPool, Token, makeEtherPool } from './FacadePool'
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

describe('Gas Benchmarks Native Eth', () => {
    let test: TestPool
    let initTx: Promise<ContractTransaction>
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeEtherPool()
       await test.fundTokens()

       initTx = test.initPool(feeRate, 0, 1, 1.0)
       await initTx

       test.useHotPath = true
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

    it("mint in virgin pool [@gas-test]", async() => {
        await expectGas(test.testMint(-100, 100, 100), 283000)
    })

    it("mint increase liq [@gas-test]", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testMint(-100, 100, 10000), 112000)
    })

    it("mint pre-init ticks [@gas-test]", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testMintOther(-100, 100, 10000), 128000)
    })

    it("mint one fresh init [@gas-test]", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testMintOther(-100, 200, 10000), 154000)
    })

    it("mint fresh ticks [@gas-test]", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testMintOther(-200, 200, 10000), 180000)
    })

    it("mint below price [@gas-test]", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testMintOther(-300, -200, 10000), 172000)
    })

    it("mint above price [@gas-test]", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testMintOther(200, 300, 100), 194000)
    })

    it("burn partial [@gas-test]", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testBurn(-100, 100, 50), 106000)
    })

    it("burn partial level left [@gas-test]", async() => {
        await test.testMint(-100, 100, 100)
        await test.testMintOther(-100, 100, 100)
        await expectGas(test.testBurn(-100, 100, 50), 106000)
    })

    it("burn full [@gas-test]", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testBurn(-100, 100, 100), 106000)
    })

    it("burn full level left [@gas-test]", async() => {
        await test.testMint(-100, 100, 100)
        await test.testMintOther(-100, 100, 100)
        await expectGas(test.testBurn(-100, 100, 100), 101000)
    })

    it("burn outside [@gas-test]", async() => {
        await test.testMint(-200, -100, 100)
        await expectGas(test.testBurn(-200, -100, 100), 81000)
    })

    it("burn outside left [@gas-test]", async() => {
        await test.testMint(-200, -100, 100)
        await test.testMintOther(-200, -100, 100)
        await expectGas(test.testBurn(-200, -100, 100), 81000)
    })

    it("burn liq rewards [@gas-test]", async() => {
        await test.testMint(-100, 100, 100000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testBurn(-100, 100, 100), 106000)
    })

    it("burn liq level left [@gas-test]", async() => {
        await test.testMint(-100, 100, 100)
        await test.testMintOther(-100, 100, 100)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testBurn(-100, 100, 100), 105000)
    })

    it("burn flipped [@gas-test]", async() => {
        await test.testMint(-100, 100, 100)
        await test.testSwapOther(true, true, 1000000, toSqrtPrice(1.1))
        await expectGas(test.testBurn(-100, 100, 100), 106000)
    })

    it("burn flipped level left [@gas-test]", async() => {
        await test.testMint(-100, 100, 100)
        await test.testMintOther(-100, 100, 1000)
        await test.testSwapOther(true, true, 1000000, toSqrtPrice(1.1))
        await expectGas(test.testBurn(-100, 100, 100), 101000)
    })

    it("harvest fees [@gas-test]", async() => {
        await test.testMint(-100, 100, 100)
        await test.testMintOther(-100, 100, 1000)
        await test.testSwapOther(true, true, 1000000, toSqrtPrice(1.1))
        await test.testSwapOther(false, true, 1000000, toSqrtPrice(1.0))
        await expectGas(test.testHarvest(-100, 100), 95000)
    })

    it("swap no pre-warm [@gas-test]", async() => {
        await test.testMint(-100, 100, 10000)
        await expectGas(test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)), 91000)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap small [@gas-test]", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)), 91000)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap small [@gas-test]", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)), 91000)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap small sell [@gas-test]", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testSwapOther(false, true, 1000, toSqrtPrice(0.9))
        await expectGas(test.testSwapOther(true, true, 1000, toSqrtPrice(1.1)), 91000)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap tick w/o cross [@gas-test]", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.0005))
        await expectGas(test.testSwapOther(true, true, 10000000, toSqrtPrice(1.005)), 102000)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap bitmap w/o cross [@gas-test]", async() => {
        await test.testMint(-500, 500, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testSwapOther(true, true, 10000000, toSqrtPrice(1.04)), 108000)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap cross tick [@gas-test]", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testMint(-500, 500, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testSwapOther(true, true, 1000000, toSqrtPrice(1.04)), 130000)
        expect(await test.liquidity()).to.be.lt(10100*1024)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap cross two tick [@gas-test]", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testMint(-200, 200, 10000)
        await test.testMint(-500, 500, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))

        await expectGas(test.testSwapOther(true, true, 2000000, toSqrtPrice(1.021)), 135000)
        expect(await test.liquidity()).to.be.lt(10100*1024)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap cross two tick and bitmap [@gas-test]", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testMint(-200, 200, 10000)
        await test.testMint(-500, 500, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))

        await expectGas(test.testSwapOther(true, true, 2000000, toSqrtPrice(1.04)), 152000)
        expect(await test.liquidity()).to.be.lt(10100*1024)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap cross bitmap between two tick  [@gas-test]", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testMint(-200, 300, 10000)
        await test.testMint(-500, 500, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))

        await expectGas(test.testSwapOther(true, true, 2000000, toSqrtPrice(1.04)), 152000)
        expect(await test.liquidity()).to.be.lt(10100*1024)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap cross many ticks [@gas-test]", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testMint(-200, 200, 1000)
        await test.testMint(-200, 210, 1000)
        await test.testMint(-200, 220, 1000)
        await test.testMint(-200, 250, 1000)
        await test.testMint(-200, 280, 1000)
        await test.testMint(-200, 300, 1000)
        await test.testMint(-500, 500, 1000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))

        await expectGas(test.testSwapOther(true, true, 2000000, toSqrtPrice(1.04)), 263000)
        expect(await test.liquidity()).to.be.lt(1010*1024)
        expect(await test.liquidity()).to.be.gt(1000*1024)
    })

    it("swap cross many bitmap [@gas-test]", async() => {
        await test.testMint(-10000, 100000, 10000)
        await test.testSwapOther(true, true, 100000000, toSqrtPrice(5.0))

        await expectGas(test.testSwapOther(true, true, 2000000, toSqrtPrice(1050.0)), 117000)
        expect(fromSqrtPrice(await test.price())).gt(2.4)
    })

})
