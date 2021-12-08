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
const METRIC_PROFILE = true

const TICK_PRICE = 207200
const PRICE = 1000000000
const LIQ = PRICE
const SWAP_QTY = 10000*PRICE

describe('Gas Benchmarks Native ETH', () => {
    let test: TestPool
    let initTx: Promise<ContractTransaction>
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
        test = await makeEtherPool()

        // Price puts tick around 207,000
        initTx = test.initPool(feeRate, 0, 1, PRICE, true)
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

    it("mint increase liq", async() => {
        await test.testMint(TICK_PRICE - 1000, TICK_PRICE + 1000, 100)
        await expectGas(test.testMint(TICK_PRICE - 1000, TICK_PRICE + 1000, 100), 126000)
    })

    it("mint pre-init ticks", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testMintOther(-100, 100, 10000), 143000)
    })

    it("mint one fresh init", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testMintOther(-100, 200, 10000), 169000)
    })

    it("mint fresh ticks", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testMintOther(-200, 200, 10000), 194000)
    })

    it("mint below price", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testMintOther(-300, -200, 10000), 184000)
    })

    it("mint above price", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testMintOther(200, 300, 100), 184000)
    })

    it("burn partial", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testBurn(-100, 100, 50), 109000)
    })

    it("burn partial level left", async() => {
        await test.testMint(-100, 100, 100)
        await test.testMintOther(-100, 100, 100)
        await expectGas(test.testBurn(-100, 100, 50), 109000)
    })

    it("burn full", async() => {
        await test.testMint(-100, 100, 100)
        await expectGas(test.testBurn(-100, 100, 100), 108000)
    })

    it("burn full level left", async() => {
        await test.testMint(-100, 100, 100)
        await test.testMintOther(-100, 100, 100)
        await expectGas(test.testBurn(-100, 100, 100), 104000)
    })

    it("burn outside", async() => {
        await test.testMint(-200, -100, 100)
        await expectGas(test.testBurn(-200, -100, 100), 84000)
    })

    it("burn outside left", async() => {
        await test.testMint(-200, -100, 100)
        await test.testMintOther(-200, -100, 100)
        await expectGas(test.testBurn(-200, -100, 100), 84000)
    })

    it("burn liq rewards", async() => {
        await test.testMint(-100, 100, 100000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testBurn(-100, 100, 100), 128000)
    })

    it("burn liq level left", async() => {
        await test.testMint(-100, 100, 100)
        await test.testMintOther(-100, 100, 100)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testBurn(-100, 100, 100), 128000)
    })

    it("burn flipped", async() => {
        await test.testMint(-100, 100, 100)
        await test.testSwapOther(true, true, 1000000, toSqrtPrice(1.1))
        await expectGas(test.testBurn(-100, 100, 100), 109000)
    })

    it("burn flipped level left", async() => {
        await test.testMint(-100, 100, 100)
        await test.testMintOther(-100, 100, 1000)
        await test.testSwapOther(true, true, 1000000, toSqrtPrice(1.1))
        await expectGas(test.testBurn(-100, 100, 100), 105000)
    })

    it("swap small", async() => {
        await test.testMint(TICK_PRICE-100, TICK_PRICE+100, LIQ)
        await test.testSwapOther(true, true, SWAP_QTY, toSqrtPrice(PRICE*1.1))
        await expectGas(test.testSwapOther(true, true, SWAP_QTY, toSqrtPrice(PRICE*1.1)), 110000)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    /*it("swap tick w/o cross", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.0005))
        await expectGas(test.testSwapOther(true, true, 10000000, toSqrtPrice(1.005)), 111000)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap bitmap w/o cross", async() => {
        await test.testMint(-500, 500, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testSwapOther(true, true, 10000000, toSqrtPrice(1.04)), 131000)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap cross tick", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testMint(-500, 500, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testSwapOther(true, true, 1000000, toSqrtPrice(1.04)), 158000)
        expect(await test.liquidity()).to.be.lt(10100*1024)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap cross two tick", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testMint(-200, 200, 10000)
        await test.testMint(-500, 500, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))

        await expectGas(test.testSwapOther(true, true, 2000000, toSqrtPrice(1.021)), 164000)
        expect(await test.liquidity()).to.be.lt(10100*1024)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap cross two tick and bitmap", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testMint(-200, 200, 10000)
        await test.testMint(-500, 500, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))

        await expectGas(test.testSwapOther(true, true, 2000000, toSqrtPrice(1.04)), 185000)
        expect(await test.liquidity()).to.be.lt(10100*1024)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap cross bitmap between two tick ", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testMint(-200, 300, 10000)
        await test.testMint(-500, 500, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))

        await expectGas(test.testSwapOther(true, true, 2000000, toSqrtPrice(1.04)), 185000)
        expect(await test.liquidity()).to.be.lt(10100*1024)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("swap cross many ticks", async() => {
        await test.testMint(-100, 100, 10000)
        await test.testMint(-200, 200, 1000)
        await test.testMint(-200, 210, 1000)
        await test.testMint(-200, 220, 1000)
        await test.testMint(-200, 250, 1000)
        await test.testMint(-200, 280, 1000)
        await test.testMint(-200, 300, 1000)
        await test.testMint(-500, 500, 1000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))

        await expectGas(test.testSwapOther(true, true, 2000000, toSqrtPrice(1.04)), 320000)
        expect(await test.liquidity()).to.be.lt(1010*1024)
        expect(await test.liquidity()).to.be.gt(1000*1024)
    })

    it("swap cross many bitmap", async() => {
        await test.testMint(-10000, 100000, 10000)
        await test.testSwapOther(true, true, 100000000, toSqrtPrice(5.0))

        await expectGas(test.testSwapOther(true, true, 2000000, toSqrtPrice(1050.0)), 142000)
        expect(fromSqrtPrice(await test.price())).gt(2.4)
    })

    it("swap surplus", async() => {
        let sender = await (await test.trader).getAddress() 
        await (await test.dex).collect(sender, -100000, (await test.base).address) 
        await (await test.dex).collect(sender, -250000, (await test.quote).address) 

        await test.testMint(-1000, 1000, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testSwapSurplus(true, true, 1000, toSqrtPrice(1.1)), 81000)
        expect(await test.liquidity()).to.be.gt(10000*1024)
    })

    it("mint surplus", async() => {
        let sender = await (await test.trader).getAddress() 
        await (await test.dex).collect(sender, -100000, (await test.base).address) 
        await (await test.dex).collect(sender, -250000, (await test.quote).address) 

        await test.testMintOther(-1000, 1000, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testMint(-1000, 1000, 5000, true), 126000)
    })

    it("burn surplus", async() => {
        let sender = await (await test.trader).getAddress() 
        await (await test.dex).collect(sender, -100000, (await test.base).address) 
        await (await test.dex).collect(sender, -250000, (await test.quote).address) 

        await test.testMintOther(-1000, 1000, 10000)
        await test.testMint(-1000, 1000, 10000)
        await test.testSwapOther(true, true, 1000, toSqrtPrice(1.1))
        await expectGas(test.testBurn(-1000, 1000, 5000, true), 90000)
    })*/

})
