import { TestPool, makeTokenPool, Token, makeEtherPool } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber, ContractTransaction } from 'ethers';

chai.use(solidity);

async function getTxGasCost (tx: Promise<ContractTransaction>): Promise<BigNumber> {
    let rcpt = await (await tx).wait(1)
    return rcpt.cumulativeGasUsed.mul(rcpt.effectiveGasPrice)
}

describe('Pool Ethereum', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeEtherPool()
       baseToken = await test.base
       quoteToken = await test.quote

       // Price puts tick around 207,000
       await test.initPool(feeRate, 0, 1, 1000000000, true)
       test.useHotPath = false
    })

    it("mint", async() => {
       await test.testMint(200000, 210000, 1024*1000*1000);

       let tgt = BigNumber.from("10074005756316541")
       expect(await baseToken.balanceOf((await test.dex).address)).to.equal(tgt)
       expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(4269666)
    })

    it("balance client side", async() => {
       let startBase = await baseToken.balanceOf(await (await test.trader).getAddress())
       let startQuote = await quoteToken.balanceOf(await (await test.trader).getAddress())

       let tx = test.testMint(200000, 210000, 1024*1000*1000);
       let gasCost = await getTxGasCost(tx)
       let tgt = BigNumber.from("10074005756316541")

       let endBase = await baseToken.balanceOf(await (await test.trader).getAddress())
       let endQuote = await quoteToken.balanceOf(await (await test.trader).getAddress())

       expect(startBase.sub(endBase).sub(gasCost)).to.equal(tgt)
       expect(startQuote.sub(endQuote)).to.equal(4269666)
    })

    it("burn", async() => {
        await test.testMint(200000, 210000, 1024*1000*1000);
        await test.testBurn(200000, 210000, 1024*1000*1000);
 
        expect(await baseToken.balanceOf((await test.dex).address)).to.equal(4)
        expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(4)
    })

    it("mint ambient ", async() => {
       await test.testMintAmbient(1024*1000*1000);

       let tgt = BigNumber.from("33158884597883211")
       expect(await baseToken.balanceOf((await test.dex).address)).to.equal(tgt)
       expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(33158888)
    })

    it("burn ambient", async() => {
        await test.testMintAmbient(1024*1000*1000);
        await test.testBurnAmbient(1024*1000*1000);
 
        expect(await baseToken.balanceOf((await test.dex).address)).to.equal(4)
        expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(4)
     })
 
    it("swap protocol fee", async() => {
        await test.testMint(200000, 210000, 1024*1000*1000);
        await test.testRevisePool(feeRate, 43, 1)

        await test.testSwap(true, false, 10000, maxSqrtPrice())
        await test.testSwap(false, false, 10000, minSqrtPrice())
        
        let bal = BigNumber.from("10074455836876107")
        expect(await baseToken.balanceOf((await test.dex).address)).to.equal(bal)
        expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(4269666)
    })
})

describe('Pool Ethereum Hotpath', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeEtherPool()
       baseToken = await test.base
       quoteToken = await test.quote

       // Price puts tick around 207,000
       await test.initPool(feeRate, 0, 1, 1000000000, true)
       test.useHotPath = true
    })

    it("mint", async() => {
       await test.testMint(200000, 210000, 1024*1000*1000);

       let tgt = BigNumber.from("10074005756316541")
       expect(await baseToken.balanceOf((await test.dex).address)).to.equal(tgt)
       expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(4269666)
    })

    it("balance client side", async() => {
        let startBase = await baseToken.balanceOf(await (await test.trader).getAddress())
        let startQuote = await quoteToken.balanceOf(await (await test.trader).getAddress())
 
        let tx = test.testMint(200000, 210000, 1024*1000*1000);
        let gasCost = await getTxGasCost(tx)
        let tgt = BigNumber.from("10074005756316541")
 
        let endBase = await baseToken.balanceOf(await (await test.trader).getAddress())
        let endQuote = await quoteToken.balanceOf(await (await test.trader).getAddress())
 
        expect(startBase.sub(endBase).sub(gasCost)).to.equal(tgt)
        expect(startQuote.sub(endQuote)).to.equal(4269666)
     })

    it("burn", async() => {
        await test.testMint(200000, 210000, 1024*1000*1000);
        await test.testBurn(200000, 210000, 1024*1000*1000);
 
        expect(await baseToken.balanceOf((await test.dex).address)).to.equal(4)
        expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(4)
    })

    it("mint ambient ", async() => {
       await test.testMintAmbient(1024*1000*1000);

       let tgt = BigNumber.from("33158884597883211")
       expect(await baseToken.balanceOf((await test.dex).address)).to.equal(tgt)
       expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(33158888)
    })

    it("burn ambient", async() => {
        await test.testMintAmbient(1024*1000*1000);
        await test.testBurnAmbient(1024*1000*1000);
 
        expect(await baseToken.balanceOf((await test.dex).address)).to.equal(4)
        expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(4)
     })
 
    it("swap protocol fee", async() => {
        await test.testMint(200000, 210000, 1024*1000*1000);
        await test.testRevisePool(feeRate, 43, 1)

        await test.testSwap(true, false, 10000, maxSqrtPrice())
        await test.testSwap(false, false, 10000, minSqrtPrice())
        
        let bal = BigNumber.from("10074455836876107")
        expect(await baseToken.balanceOf((await test.dex).address)).to.equal(bal)
        expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(4269666)
    })
})



