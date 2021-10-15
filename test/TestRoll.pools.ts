import { TestPool, makeTokenPool, Token } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber } from 'ethers';
import { ConcentratedDirective } from './EncodeOrder';

chai.use(solidity);

describe('Roll Pools', () => {
    let test: TestPool
    const feeRate = 0
    const pool2 = 48395
    const pool3 = 5934

    beforeEach("deploy",  async () => {
       test = await makeTokenPool()

       await test.initPool(feeRate, 0, 1, 1.5)
       await test.initPoolIdx(pool2, feeRate, 0, 10, 1.7)
       await test.initPoolIdx(pool3, feeRate, 0, 6, 1.4)
    })

    it("roll between pools", async() => {
        await test.testMintAmbient(10000)
        await test.testMintAmbientIdx(20000, pool2)
        await test.testMintAmbientIdx(30000, pool3)
        
        let order = await test.prototypeOrder(3)

        order.hops[0].pools[0].swap.isBuy = true
        order.hops[0].pools[0].swap.inBaseQty = true
        order.hops[0].pools[0].swap.limitPrice = maxSqrtPrice()
        order.hops[0].pools[0].swap.qty = BigNumber.from(100000)    

        order.hops[0].pools[1].poolIdx = pool2
        order.hops[0].pools[1].swap.isBuy = false
        order.hops[0].pools[1].swap.inBaseQty = true
        order.hops[0].pools[1].swap.limitPrice = minSqrtPrice()
        order.hops[0].pools[1].swap.qty = BigNumber.from(0)  

        await test.testOrder(order)

        expect(fromSqrtPrice(await test.price())).to.gt(1.5)
        expect(fromSqrtPrice(await test.price())).to.lt(1.55)
        expect(fromSqrtPrice(await test.priceIdx(pool2))).to.lt(1.7)
        expect(fromSqrtPrice(await test.priceIdx(pool2))).to.gt(1.65)

        expect(await test.snapBaseOwed()).to.equal(0)        
        expect(await test.snapQuoteOwed()).to.equal(-7080)
    })
})