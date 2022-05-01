import { TestPool, makeTokenPool } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, MIN_TICK, MAX_TICK } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { AbiCoder } from 'ethers/lib/utils';

chai.use(solidity);

describe('Pool Security', () => {
    let test: TestPool
    const treasury: string = "0x0000000000000000000000000000000000000019"

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       await test.fundTokens()
    })

    it("double initialize", async() => {
        await test.initPool(0, 0, 1, 1.5)
        await expect(test.initPool(0, 0, 10, 1.5)).to.reverted
        await expect(test.initPool(225*100, 0, 1, 2.5)).to.reverted
        await expect(test.initPool(0, 5, 1, 1.5)).to.reverted
    })

    it("template disabled", async() => {
        let abi = new AbiCoder()
        let disableCmd = abi.encode(["uint8", "uint256"], [109, test.poolIdx]);

        await test.initTempl(0, 1)
        test.initTemplBefore = false
        await (await test.dex).connect(await test.auth).protocolCmd(test.COLD_PROXY, disableCmd, false);
        await expect(test.initPool(0, 0, 1, 1.5)).to.be.reverted
    })

    it("pre-initialize", async() => {
        await expect(test.testMint(-100, 100, 10000)).to.be.reverted
        await expect(test.testSwap(true, true, 100, toSqrtPrice(2.0))).to.be.reverted
        await expect(test.testSwap(false, false, 100, toSqrtPrice(2.0))).to.be.reverted
        await expect(test.testBurn(-100, 100, 10000)).to.be.reverted
    })

    it("mint outside tick range", async() => {
        await test.initPool(0, 0, 1, 1.5)
        await expect(test.testMint(MIN_TICK-1, 0, 100000)).to.be.reverted
        await expect(test.testMint(0, MAX_TICK+1, 100000)).to.be.reverted
        await test.testMint(MIN_TICK, MAX_TICK, 100000)
    })

    it("over burn", async() => {
        await test.initPool(0, 0, 1, 1.5)
        await test.testMint(-100, 100, 10000);
        await test.testMint(5000, 6000, 20000);
        await test.testMint(3000, 5000, 30000);

        await expect(test.testBurn(-100, 100, 10001)).to.be.reverted
        await expect(test.testBurn(3000, 5000, 35000)).to.be.reverted
        await expect(test.testBurn(5000, 6000, 21000)).to.be.reverted
        
        await test.testBurn(-100, 100, 8000)
        await test.testBurn(5000, 6000, 20000)
        await test.testBurn(3000, 5000, 1000)
        await expect(test.testBurn(-100, 100, 2001)).to.be.reverted
        await expect(test.testBurn(3000, 5000, 29100)).to.be.reverted
        await expect(test.testBurn(5000, 6000, 1)).to.be.reverted
        await expect(test.testBurn(-101, 100, 1000)).to.be.reverted        
        await expect(test.testBurn(-100, 101, 1000)).to.be.reverted
    })

    it("burn steal", async() => {
        await test.initPool(0, 0, 1, 1.5)
        await test.testMint(-100, 100, 10000);
        await test.testMint(5000, 6000, 20000);
        await test.testMint(3000, 5000, 30000);

        // Make sure the other account can actually mint/burn, so we're not failing
        // for reasons other than authorization. 
        await test.testMintOther(-100, 100, 50000)
        await test.testBurnOther(-100, 100, 50000)

        await expect(test.testBurn(-100, 100, 10001)).to.be.reverted
        await expect(test.testBurn(3000, 5000, 35000)).to.be.reverted
        await expect(test.testBurn(5000, 6000, 21000)).to.be.reverted

        await expect(test.testBurnOther(-100, 100, 1000)).to.be.reverted
        await expect(test.testBurnOther(3000, 5000, 5000)).to.be.reverted
        await expect(test.testBurnOther(5000, 6000, 1)).to.be.reverted

        await test.testMintOther(3000, 5000, 6000)
        await expect(test.testBurnOther(5000, 6000, 6001)).to.reverted
        await expect(test.testBurnOther(5000, 6000, 31000)).to.reverted
    })

    /* Protocol authorization checks */

    /* Reentrancy checks */
})