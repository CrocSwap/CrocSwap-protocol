import { TestPool, makeTokenPool, Token } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, ZERO_ADDR } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { HotProxy } from '../typechain/HotProxy';
import { ContractFactory } from 'ethers';
import { MockHotProxy } from '../typechain/MockHotProxy';
import { ColdPath } from '../typechain';
import { MockProxySidecar } from '../contracts/typechain';

chai.use(solidity);

describe('Pool Proxy Paths', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    let hotProxy: HotProxy
    let mockProxy: MockHotProxy
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = true
       test.useSwapProxy.base = true;

       let factory = await ethers.getContractFactory("HotProxy") as ContractFactory
       hotProxy = await factory.deploy() as HotProxy

       factory = await ethers.getContractFactory("MockHotProxy") as ContractFactory
       mockProxy = await factory.deploy() as MockHotProxy
    })

    it("swap proxy", async() => {
        await test.testUpgradeHotProxy(hotProxy.address)

        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 93172
        const counterFlow = -6620437

        await test.snapStart()
        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(10240000)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)

        expect(await test.liquidity()).to.equal(1000000*1024 + liqGrowth)
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10240000)

        let price = fromSqrtPrice((await test.price()))
        expect(price).to.gte(1.524317)
        expect(price).to.lte(1.524318)
    })

    it("swap proxy optional", async() => {
        test.useSwapProxy.base = false
        await test.testUpgradeHotProxy(hotProxy.address, false)

        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)
        
        const liqGrowth = 93172
        const counterFlow = -6620437

        await test.snapStart()
        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        expect(await test.snapBaseFlow()).to.equal(10240000)
        expect(await test.snapQuoteFlow()).to.equal(counterFlow)
    })

    it("swap force proxy", async() => {
        await test.testUpgradeHotProxy(hotProxy.address, true)
        await test.testMint(-5000, 8000, 1000000); 
        test.useSwapProxy.base = false
        await expect(test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))).to.be.reverted
    })

    it("swap long path okay", async() => {
        test.useSwapProxy.base = false
        test.useHotPath = false
        await test.testUpgradeHotProxy(hotProxy.address, true)

        await test.testMint(-5000, 8000, 1000000); 
        let startQuote = await quoteToken.balanceOf((await test.dex).address)
        let startBase = await baseToken.balanceOf((await test.dex).address)        
        const counterFlow = -6620437
        
        await test.snapStart()
        await test.testSwap(true, true, 10000*1024, toSqrtPrice(2.0))
        expect((await quoteToken.balanceOf((await test.dex).address)).sub(startQuote)).to.equal(counterFlow)
        expect((await baseToken.balanceOf((await test.dex).address)).sub(startBase)).to.equal(10240000)
    })

    const DUMMY_SLOT = 500; 

    it("cannot upgrade boot path", async() => {
        let factory = await ethers.getContractFactory("MockProxySidecar") as ContractFactory
        let proxy = await factory.deploy() as MockProxySidecar
  
        // Cannot overwrite the boot path slot because that could potentially permenately break upgradeability
        await expect(test.testUpgrade(test.BOOT_PROXY, proxy.address)).to.be.reverted
  
        // Can overwrite other slots...
        await expect(test.testUpgrade(DUMMY_SLOT, proxy.address)).to.not.be.reverted
    })

    it("upgrade requires contract address", async() => {
        let factory = await ethers.getContractFactory("MockProxySidecar") as ContractFactory
        let proxy = await factory.deploy() as MockProxySidecar
        let eoaAddr = await (await test.trader).getAddress()

        // Cannot overwrite a non-contract address to a slot
        await expect(test.testUpgrade(DUMMY_SLOT, eoaAddr)).to.be.reverted
        
        // Can write a valid contract address to a slot
        await expect(test.testUpgrade(DUMMY_SLOT, proxy.address)).to.not.be.reverted

        // Can delete a slot by setting address to 0
        await expect(test.testUpgrade(DUMMY_SLOT, ZERO_ADDR)).to.not.be.reverted
    })

    it("requires proxy contract accept", async() => {
        let factory = await ethers.getContractFactory("MockProxySidecar") as ContractFactory
        let proxy = await factory.deploy() as MockProxySidecar
        let eoaAddr = await (await test.trader).getAddress()

        // Will reject because the dex address does not match
        await proxy.setRole(DUMMY_SLOT, eoaAddr);
        await expect(test.testUpgrade(DUMMY_SLOT, proxy.address)).to.be.reverted

        // Will reject because the slot does not match
        await proxy.setRole(DUMMY_SLOT, (await test.dex).address);
        await expect(test.testUpgrade(DUMMY_SLOT+1, proxy.address)).to.be.reverted

        // Will accept because both match
        await expect(test.testUpgrade(DUMMY_SLOT, proxy.address)).to.not.be.reverted
    })
})
