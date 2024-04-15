import { TestPool, makeTokenPool, Token, createWbera } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, ZERO_ADDR, MAX_PRICE } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { OrderDirective, SettlementDirective, HopDirective, PoolDirective, AmbientDirective, ConcentratedDirective, encodeOrderDirective } from './EncodeOrder';
import { BigNumber } from 'ethers';
import { makeRe } from 'minimatch';
import { WBERA } from '../typechain';

chai.use(solidity);

describe('Pool Rebalance', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100
    let wbera: WBERA

    before(async () => {
        wbera = await createWbera()
    })
    beforeEach("deploy",  async () => {
       test = await makeTokenPool(wbera)
       baseToken = await test.base
       quoteToken = await test.quote

       await test.initPool(feeRate, 0, 1, 1.0)
       test.useHotPath = true;
    })

    function makeRebalOrder(): OrderDirective {
        let open: SettlementDirective = {
            token: baseToken.address,
            limitQty: BigNumber.from("1000000000000000000"),
            dustThresh: BigNumber.from(0),
            useSurplus: true
        }

        let close: SettlementDirective = {
            token: quoteToken.address,
            limitQty: BigNumber.from("1000000000000000000"),
            dustThresh: BigNumber.from(0),
            useSurplus: true
        }

        let order: OrderDirective = { 
            schemaType: 1,
            open: open,
            hops: []
        }

        let hop: HopDirective = {
            pools: [],
            settlement: close,
            improve: { isEnabled: false, useBaseSide: false }
        }
        order.hops.push(hop)

        let emptyAmbient: AmbientDirective = {
            isAdd: false,
            liquidity: BigNumber.from(0)
        }

        let firstDir: PoolDirective = {
            poolIdx: BigNumber.from(test.poolIdx),
            passive: { ambient: emptyAmbient, concentrated: [] },
            swap: {
                isBuy: true,
                inBaseQty: true,
                qty: BigNumber.from(5000),
                rollType: 4,
                limitPrice: MAX_PRICE
            },
            chain: {
                rollExit: false,
                swapDefer: true,
                offsetSurplus: false
            }
        }

        let burnLp: ConcentratedDirective = {
            lowTick: -500, isRelTick: false,
            highTick: -200, isAdd: false, liquidity: BigNumber.from(1000*1024)
        }
        firstDir.passive.concentrated.push(burnLp)
        hop.pools.push(firstDir)

        let secondDir: PoolDirective = {
            poolIdx: BigNumber.from(test.poolIdx),
            passive: { ambient: emptyAmbient, concentrated: [] },
            swap: {
                isBuy: true,
                inBaseQty: true,
                qty: BigNumber.from(0),
                limitPrice: MAX_PRICE
            },
            chain: {
                rollExit: false,
                swapDefer: true,
                offsetSurplus: false
            }
        }

        let mintLp: ConcentratedDirective = {
            lowTick: -100, isRelTick: false,
            highTick: 100, isAdd: false, 
            rollType: 5,
            liquidity: BigNumber.from(0) }
        secondDir.passive.concentrated.push(mintLp)
        hop.pools.push(secondDir)

        return order
    }

    it("rebalance range", async() => {
        await test.testMint(-1000, 1000, 100000)
        await test.testMint(-500, -200, 1000);

        let order = makeRebalOrder()
        let tx = await test.testOrder(order);

        let baseSurp = (await test.query).querySurplus(await (await test.trader).getAddress(), baseToken.address)
        let quoteSurp = (await test.query).querySurplus(await (await test.trader).getAddress(), quoteToken.address)

        expect(await baseSurp).to.be.gt(0)
        expect(await baseSurp).to.be.lt(100)
        expect(await quoteSurp).to.be.gt(0)
        expect(await quoteSurp).to.be.lt(100)

        test.snapStart()
        await test.testBurn(-100, 100, 1000)
        let basePos = await test.snapBaseOwed()
        let quotePos = await test.snapQuoteOwed()
        expect(basePos).to.be.equal(-5181)
        expect(quotePos).to.be.equal(-5032)        
    })


    it("rebalance gas [@gas-test]", async() => {
        await test.testMint(-1000, 1000, 100000)
        await test.testMint(-500, -200, 1000);

        let order = makeRebalOrder()
        let tx = await test.testOrder(order);

        expect((await tx.wait()).gasUsed).to.lt(332000)
    })
  
    function makeRebalOrderTwo(): OrderDirective {
        let open: SettlementDirective = {
            token: baseToken.address,
            limitQty: BigNumber.from("0"),
            dustThresh: BigNumber.from(0),
            useSurplus: true
        }

        let close: SettlementDirective = {
            token: quoteToken.address,
            limitQty: BigNumber.from("0"),
            dustThresh: BigNumber.from(0),
            useSurplus: true
        }

        let order: OrderDirective = { 
            schemaType: 1,
            open: open,
            hops: []
        }

        let hop: HopDirective = {
            pools: [],
            settlement: close,
            improve: { isEnabled: false, useBaseSide: false }
        }
        order.hops.push(hop)

        let emptyAmbient: AmbientDirective = {
            isAdd: false,
            liquidity: BigNumber.from(0)
        }

        let firstDir: PoolDirective = {
            poolIdx: BigNumber.from(test.poolIdx),
            passive: { ambient: emptyAmbient, concentrated: [] },
            swap: {
                isBuy: true,
                inBaseQty: true,
                qty: BigNumber.from(0),
                rollType: 5,
                limitPrice: MAX_PRICE
            },
            chain: {
                rollExit: false,
                swapDefer: true,
                offsetSurplus: false
            }
        }

        let burnLp: ConcentratedDirective = {
            lowTick: -500, isRelTick: false,
            highTick: -300, isAdd: false, liquidity: BigNumber.from(1000*1024)
        }
        let mintLpFloor: ConcentratedDirective = {
            lowTick: -100, highTick: 100, isRelTick: false,
            isAdd: true, liquidity: BigNumber.from(950*1024)
        }

        firstDir.passive.concentrated.push(burnLp)
        firstDir.passive.concentrated.push(mintLpFloor)
        
        hop.pools.push(firstDir)

        return order
    }

    it("rebalance liq", async() => {
        await test.testMint(-1000, 1000, 100000)
        await test.testMint(-500, -300, 1000);

        let order = makeRebalOrderTwo()
        let tx = await test.testOrder(order);

        let baseSurp = (await test.query).querySurplus(await (await test.trader).getAddress(), baseToken.address)
        let quoteSurp = (await test.query).querySurplus(await (await test.trader).getAddress(), quoteToken.address)

        expect(await baseSurp).to.be.eq(0)
        expect(await quoteSurp).to.be.gt(0)
        expect(await quoteSurp).to.be.lt(300)

        test.snapStart()
        await test.testBurn(-100, 100, 950)
        let basePos = await test.snapBaseOwed()
        let quotePos = await test.snapQuoteOwed()
        expect(basePos).to.be.equal(-4899)
        expect(quotePos).to.be.equal(-4803)        
    })

    it("rebalance liq gas [@gas-test]", async() => {
        await test.testMint(-1000, 1000, 100000)
        await test.testMint(-500, -300, 1000);

        let order = makeRebalOrderTwo()
        let tx = await test.testOrder(order);

        expect((await tx.wait()).gasUsed).to.lt(309000)
    })
})
