import { TestPool } from './FacadePool'
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

    beforeEach("deploy",  async () => {
       test = new TestPool()
       await test.fundTokens()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPermitPool(feeRate, 0, 1, 1.5)
       await test.fundTokens()    
       await (await test.permit).setPassThru(true)
       await test.testMint(-10000, 10000, 10000);
    })

    it("permit oracle", async() => {
        await (await test.permit).setPassThru(false)
        await (await test.permit).setMatching(await (await test.trader).getAddress(),
            (await test.base).address, (await test.quote).address, 500)

        // Should be approved
        await test.testSwap(true, true, 500, toSqrtPrice(2.0))
    
        // Should fail due to swapQty
        await expect(test.testSwap(true, true, 400, toSqrtPrice(2.0))).to.be.reverted

        // Fail due to base address
        await (await test.permit).setMatching(await (await test.trader).getAddress(),
            ZERO_ADDR, (await test.quote).address, 500)
        await expect(test.testSwap(true, true, 500, toSqrtPrice(2.0))).to.be.reverted

        // Fail due to quote address
        await (await test.permit).setMatching(await (await test.trader).getAddress(),
            (await test.base).address, ZERO_ADDR, 500)
        await expect(test.testSwap(true, true, 500, toSqrtPrice(2.0))).to.be.reverted

        // Fail due to msg.sender
        await (await test.permit).setMatching(ZERO_ADDR,
            (await test.base).address, (await test.quote).address, 500)
        await expect(test.testSwap(true, true, 500, toSqrtPrice(2.0))).to.be.reverted
    })
})
