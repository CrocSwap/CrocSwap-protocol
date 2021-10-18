import { TestPool, makeTokenPool, Token } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';

chai.use(solidity);

describe('Pool', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100

    let router = "0x9c8f005ab27AdB94f3d49020A15722Db2Fcd9F27"
    let routerTwo = "0xFe5550377b3cF7cC14cafCC7Ee378D0B979718C2"

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.5)
       test.useHotPath = true
    })

    it("approve router", async() => {
        let results = await (await test.query).queryRouterApproved(router, await (await test.trader).getAddress())
        expect(results.burn).to.be.eq(false)
        expect(results.debit).to.be.eq(false);
        
        // Set for tx.origin other
        await (await test.dex).connect(await test.other).approveRouter(router, true, false)

        // tx.origin trader shoudl still be turned off
        results = await (await test.query).queryRouterApproved(router, await (await test.trader).getAddress())
        expect(results.burn).to.be.eq(false)
        expect(results.debit).to.be.eq(false);

        await (await test.dex).connect(await test.trader).approveRouter(router, true, false)        
        results = await (await test.query).queryRouterApproved(router, await (await test.trader).getAddress())
        expect(results.debit).to.be.eq(true)
        expect(results.burn).to.be.eq(false);

        // Should be turned off for the non-approved router address
        results = await (await test.query).queryRouterApproved(routerTwo, await (await test.trader).getAddress())
        expect(results.debit).to.be.eq(false)
        expect(results.burn).to.be.eq(false);

        // Flip permissions
        await (await test.dex).connect(await test.trader).approveRouter(router, false, true)        
        results = await (await test.query).queryRouterApproved(router, await (await test.trader).getAddress())
        expect(results.debit).to.be.eq(false)
        expect(results.burn).to.be.eq(true);

        // Permit both types
        await (await test.dex).connect(await test.trader).approveRouter(router, true, true)        
        results = await (await test.query).queryRouterApproved(router, await (await test.trader).getAddress())
        expect(results.debit).to.be.eq(true)
        expect(results.burn).to.be.eq(true);

        // Turn off
        await (await test.dex).connect(await test.trader).approveRouter(router, false, false)        
        results = await (await test.query).queryRouterApproved(router, await (await test.trader).getAddress())
        expect(results.debit).to.be.eq(false)
        expect(results.burn).to.be.eq(false);

    })

})
