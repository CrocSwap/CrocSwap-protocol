import { TestDex } from '../typechain/TestDex'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { CrocSwapDex } from '../typechain/CrocSwapDex';
import { Signer } from 'ethers';

chai.use(solidity);

describe('Dex', () => {
    let dex: CrocSwapDex
    let tester: TestDex
    let trader: Signer
    let auth: Signer
    let baseToken: MockERC20
    let quoteToken: MockERC20

    const INIT_BAL = 100000000000

    const poolIdx = 85593
    const feeRate = 225 * 100
    const protoTake = 0
    const tickSize = 10

    beforeEach("deploy",  async () => {
        let factory = await ethers.getContractFactory("MockERC20")
        baseToken = await factory.deploy() as MockERC20
        quoteToken = await factory.deploy() as MockERC20
 
        let accts = await ethers.getSigners()
        trader = accts[0]
        auth = accts[1]

        factory = await ethers.getContractFactory("CrocSwapDex")
        dex = await factory.deploy(await auth.getAddress()) as CrocSwapDex

        factory = await ethers.getContractFactory("TestDex")
        tester = await factory.deploy(dex.address) as TestDex

        await baseToken.deposit(await trader.getAddress(), INIT_BAL);
        await baseToken.approveFor(await trader.getAddress(), dex.address, INIT_BAL);
        await quoteToken.deposit(await trader.getAddress(), INIT_BAL);
        await quoteToken.approveFor(await trader.getAddress(), dex.address, INIT_BAL);
    })

    it("empty", async() => {
        await dex.connect(auth).setPoolTemplate(poolIdx, feeRate, protoTake, tickSize)
        await dex.initPool(baseToken.address, quoteToken.address, poolIdx, 
            toSqrtPrice(2.25))
        
    })

})
