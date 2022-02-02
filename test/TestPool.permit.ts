import { TestPool, makeTokenPool } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { toSqrtPrice, ZERO_ADDR } from './FixedPoint';

chai.use(solidity);

describe('permissioned pool', () => {
    let test: TestPool
    let baseToken: MockERC20
    let quoteToken: MockERC20
    const feeRate = 225 * 100

    const SWAP_ACT_CODE = 2;
    const MINT_ACT_CODE = 3;
    const BURN_ACT_CODE = 4;
    const COMP_ACT_CODE = 1;

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       await test.fundTokens()

       await test.initPermitPool(feeRate, 0, 1, 1.5)
       await test.fundTokens()    
       await (await test.permit).setPassThru(true)
       await test.testMint(-10000, 10000, 10000);

       test.useHotPath = true
    })

    it("permit oracle", async() => {
        await (await test.permit).setPassThru(false)
        await (await test.permit).setMatching(await (await test.trader).getAddress(),
            (await test.base).address, (await test.quote).address)

        // Should be approved
        await test.testSwap(true, false, 500, toSqrtPrice(2.0))
        expect(await (await test.permit).isBuySnap_()).to.be.true
        expect(await (await test.permit).inBaseQtySnap_()).to.be.false
        expect(await (await test.permit).qtySnap_()).to.eq(500)
        expect(await (await test.permit).codeSnap_()).to.eq(SWAP_ACT_CODE)

        // Should also be approved
        await test.testSwap(false, true, 1000, toSqrtPrice(0.5))
        expect(await (await test.permit).isBuySnap_()).to.eq(false)
        expect(await (await test.permit).inBaseQtySnap_()).to.eq(true)
        expect(await (await test.permit).qtySnap_()).to.eq(1000)

        // Fail due to base address
        await (await test.permit).setMatching(await (await test.trader).getAddress(),
            ZERO_ADDR, (await test.quote).address)
        await expect(test.testSwap(true, true, 500, toSqrtPrice(2.0))).to.be.reverted

        // Fail due to quote address
        await (await test.permit).setMatching(await (await test.trader).getAddress(),
            (await test.base).address, ZERO_ADDR)
        await expect(test.testSwap(true, true, 500, toSqrtPrice(2.0))).to.be.reverted

        // Fail due to msg.sender
        await (await test.permit).setMatching(ZERO_ADDR,
            (await test.base).address, (await test.quote).address)
        await expect(test.testSwap(true, true, 500, toSqrtPrice(2.0))).to.be.reverted
   })

   it("mint/burn concentrated", async() => {
    await (await test.permit).setPassThru(false)
    await (await test.permit).setMatching(await (await test.trader).getAddress(),
        (await test.base).address, (await test.quote).address)

    // Should be approved
    await test.testMint(-5000, 5000, 25000)
    expect(await (await test.permit).bidTickSnap_()).to.eq(-5000)
    expect(await (await test.permit).askTickSnap_()).to.eq(5000)
    expect(await (await test.permit).liqSnap_()).to.eq(25000*1024)
    expect(await (await test.permit).codeSnap_()).to.eq(MINT_ACT_CODE)

    // Reset bid/ask snapsshots
    await test.testMint(8000, 12000, 25000)

    await test.testBurn(-5000, 5000, 19000)
    expect(await (await test.permit).bidTickSnap_()).to.eq(-5000)
    expect(await (await test.permit).askTickSnap_()).to.eq(5000)
    expect(await (await test.permit).liqSnap_()).to.eq(19000*1024)
    expect(await (await test.permit).codeSnap_()).to.eq(BURN_ACT_CODE)
   })

   it("mint/burn ambient", async() => {
    await (await test.permit).setPassThru(false)
    await (await test.permit).setMatching(await (await test.trader).getAddress(),
        (await test.base).address, (await test.quote).address)

    // Should be approved
    await test.testMintAmbient(25000)
    expect(await (await test.permit).bidTickSnap_()).to.eq(0)
    expect(await (await test.permit).askTickSnap_()).to.eq(0)
    expect(await (await test.permit).liqSnap_()).to.eq(25000*1024)
    expect(await (await test.permit).codeSnap_()).to.eq(MINT_ACT_CODE)

    await test.testBurnAmbient(19000)
    expect(await (await test.permit).bidTickSnap_()).to.eq(0)
    expect(await (await test.permit).askTickSnap_()).to.eq(0)
    expect(await (await test.permit).liqSnap_()).to.eq(19000*1024)
    expect(await (await test.permit).codeSnap_()).to.eq(BURN_ACT_CODE)
   })

   it("compound directive", async() => {
    // Will switch to long-form orders
    test.useHotPath = false;

    await (await test.permit).setPassThru(false)
    await (await test.permit).setMatching(await (await test.trader).getAddress(),
        (await test.base).address, (await test.quote).address)

    // Should be approved
    await test.testSwap(true, false, 500, toSqrtPrice(2.0))
    expect(await (await test.permit).codeSnap_()).to.eq(COMP_ACT_CODE)

    // Fail due to base address
    await (await test.permit).setMatching(await (await test.trader).getAddress(),
        ZERO_ADDR, (await test.quote).address)
    await expect(test.testSwap(true, true, 500, toSqrtPrice(2.0))).to.be.reverted

    // Fail due to quote address
    await (await test.permit).setMatching(await (await test.trader).getAddress(),
        (await test.base).address, ZERO_ADDR)
    await expect(test.testSwap(true, true, 500, toSqrtPrice(2.0))).to.be.reverted

    // Fail due to msg.sender
    await (await test.permit).setMatching(ZERO_ADDR,
        (await test.base).address, (await test.quote).address)
    await expect(test.testSwap(true, true, 500, toSqrtPrice(2.0))).to.be.reverted
})
})
