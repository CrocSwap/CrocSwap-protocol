import { TestPool, makeTokenPool, Token, makeEtherPool } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber } from 'ethers';

chai.use(solidity);

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
       await test.initPool(feeRate, 0, 1, 1000000000)
       test.useHotPath = true
    })

    const MINT_BUFFER = 4;

    it("mint", async() => {
       await test.testMint(200000, 210000, 1024*1000*1000);

       let tgt = BigNumber.from("10074005756316541")
       expect(await baseToken.balanceOf((await test.dex).address)).to.equal(tgt)
       expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(4269666)
       expect(await test.snapBaseOwed()).to.gte(tgt)
       expect(await test.snapBaseOwed()).to.lt(tgt.add(BigNumber.from("10005756316541")))
       expect(await test.snapQuoteOwed()).to.equal(4269666)

    })

    it("burn", async() => {
        await test.testMint(200000, 210000, 1024*1000*1000);
        await test.testBurn(200000, 210000, 1024*1000*1000);
 
        let bal = BigNumber.from("1000000000000000004")
        let tgt = BigNumber.from("10074005756316541")
        expect(await baseToken.balanceOf((await test.dex).address)).to.equal(bal)
        expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(4)
        expect(await test.snapBaseOwed()).to.gte(tgt)
        expect(await test.snapBaseOwed()).to.lt(tgt.add(BigNumber.from("10005756316541")))
        expect(await test.snapQuoteOwed()).to.equal(-4269662)
    })

    it("mint ambient ", async() => {
       await test.testMintAmbient(1024*1000*1000);

       let tgt = BigNumber.from("33158884597883211")
       expect(await baseToken.balanceOf((await test.dex).address)).to.equal(tgt)
       expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(33158888)
       expect(await test.snapBaseOwed()).to.gte(tgt)
       expect(await test.snapBaseOwed()).to.lt(tgt.add(BigNumber.from("33158884597883211")))
       expect(await test.snapQuoteOwed()).to.equal(33158888)

    })

    it("burn ambient", async() => {
        await test.testMintAmbient(1024*1000*1000);
        await test.testBurnAmbient(1024*1000*1000);
 
        let bal = BigNumber.from("1000000000000000004")
        let tgt = BigNumber.from("33158884597883211")
        expect(await baseToken.balanceOf((await test.dex).address)).to.equal(bal)
        expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(4)
        expect(await test.snapBaseOwed()).to.gte(tgt)
        expect(await test.snapBaseOwed()).to.lt(tgt.add(BigNumber.from("10005756316541")))
        expect(await test.snapQuoteOwed()).to.equal(-33158884)
     })
 
    it("swap protocol fee", async() => {
        await test.testMint(200000, 210000, 1024*1000*1000);
        await test.testRevisePool(feeRate, 6, 1)

        await test.testSwap(true, false, 10000, maxSqrtPrice())
        await test.testSwap(false, false, 10000, minSqrtPrice())
        
        let bal = BigNumber.from("1010074455836789651")
        let tgt = BigNumber.from("1000097398443009582")
        expect(await baseToken.balanceOf((await test.dex).address)).to.equal(bal)
        expect(await quoteToken.balanceOf((await test.dex).address)).to.equal(4269666)
        expect(await test.snapBaseOwed()).to.gt(tgt.sub(BigNumber.from("10005756316541")))
        expect(await test.snapBaseOwed()).to.lt(tgt.add(BigNumber.from("10005756316541")))
        expect(await test.snapQuoteOwed()).to.equal(10000)
    })
})


