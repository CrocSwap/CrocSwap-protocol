import { TestEncoding } from '../typechain/TestEncoding';
import { expect } from "chai";
import chai from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import { toSqrtPrice } from './FixedPoint';
import { OrderDirective, PassiveDirective, SwapDirective, PoolDirective, ConcentratedBookend, ConcentratedDirective, SettlementDirective, HopDirective, encodeOrderDirective, ImproveDirective, ChainingDirective } from './EncodeOrder';
import { BigNumber } from 'ethers';

chai.use(solidity);

describe('Encoding', () => {
    let encoder: TestEncoding
    let order: OrderDirective

    beforeEach("deploy", async () => {
        const libFactory = await ethers.getContractFactory("TestEncoding");
        encoder = (await libFactory.deploy()) as TestEncoding
        order = buildOrder()
    })

    function buildOrder(): OrderDirective {
        let poolJ = buildPool(5600, emptyPassive(), 
            buildSwap(15, true, false, 2500, 1.5),
            buildPassive(280*1024, [-50], [[300, 75, -25]], [[95*1024, 30*1024, 5000*1024]]))
        let poolK = buildPool(5601, 
            buildPassive(281*1024, [250, 20], [[-50, 50], [-200]], [[80*1024, 85*1024], [5000*1024]]),
            buildSwap(0, false, true, 750000, 0.25),
            buildPassive(280*1024, [-50], [[300, 75, -25]], [[95*1024, 30*1024, 5000*1024]]))
        let poolL = buildPool(84, 
            buildPassive(281*1024, [200], [[]], [[]]),
            buildSwap(100, true, true, 7500000, 95.0),
            buildPassive(280*1024, [-5000], [[-6000, 4000]], [[300*1024, 400*1024]]))
        let poolM = buildPool(84, 
            buildPassive(-295*1024, [200], [[]], [[]]),
            buildSwap(100, true, true, 7500000, 95.0),
            buildPassive(-296*1024, [-5000], [[-6000, 4000]], [[300*1024, 400*1024]]))
        let poolN = buildPool(128, 
            buildPassive(281*1024, [200], [[]], [[]]),
            buildSwap(0, false, false, 0, 0),
            buildPassive(280*1024, [-5000], [[-6000, 4000]], [[300*1024, 400*1024]]))
        let poolQ = buildPool(250, emptyPassive(),
            buildSwap(0, true, false, 50000, 0.0625), emptyPassive())
        let poolR = buildPool(0, buildAmbientOnly(25000),
            buildSwap(1, false, true, 80000, 64000),
            buildPassive(0, [900, -800, 25], [[-1], [50, 25, -35], [10, 5]], 
                [[5675*1024], [5689*1024, 50000000*1024, 10*1024], [9*1024, 80*1024]]))

        
        let hopA = buildHop(buildSettle("DE0", 65000, 10, false),
            { isEnabled: false, useBaseSide: false },
            { rollExit: true, swapDefer: false},
            [poolJ, poolK, poolL])
        let hopB = buildHop(buildSettle("9A8", -50000, 15, false),
            { isEnabled: true, useBaseSide: false },
            { rollExit: false, swapDefer: false},
            [poolM, poolN])
        let hopC = buildHop(buildSettle("7C5", -800000, 5000, true),
            { isEnabled: false, useBaseSide: true },
            { rollExit: false, swapDefer: false},
            [poolQ, poolR])
        let hopD = buildHop(buildSettle("456", 80000, 0, false),
            { isEnabled: true, useBaseSide: true },
            { rollExit: false, swapDefer: true},
            [])
        
        return { open: buildSettle("A25", 512, 128, true),
            hops: [hopA, hopB, hopC, hopD] }
    }

    function buildHop (settle: SettlementDirective, 
        improve: ImproveDirective, chain: ChainingDirective,
        pools: PoolDirective[]): HopDirective {
        return { pools: pools, settlement: settle, 
            improve: improve, chain: chain }
    }

    function buildSettle (token: string, qty: number, 
        dust: number, useReserves: boolean): SettlementDirective {
        return { token: toToken(token), limitQty: BigNumber.from(qty), 
            dustThresh: BigNumber.from(dust), useReserves: useReserves }
    }

    function toToken (token: string): string {
        return "0x00000000000000000" + token
    }

    function buildPool (poolIdx: number, passive: PassiveDirective, swap: SwapDirective,
        post: PassiveDirective): PoolDirective {
        return { poolIdx: poolIdx, passive: passive, swap: swap, passivePost: post }
    }

    function buildSwap (liqMask: number, isBuy: boolean, inBaseQty: boolean, 
        qty: number, price: number): SwapDirective {
        return { liqMask: liqMask, isBuy: isBuy, inBaseQty: inBaseQty,
            qty: BigNumber.from(qty), limitPrice: toSqrtPrice(price) }
    }

    function emptyPassive(): PassiveDirective {
        return buildPassive(0, [], [], [])
    }

    function buildAmbientOnly (liq: number): PassiveDirective {
        return buildPassive(liq, [], [], [])
    }

    function buildPassive (ambientLiq: number, openTicks: number[], closeTicks: number[][],
        concLiqs: number[][]): PassiveDirective {
        let concs: ConcentratedDirective[] = []
        for (let i = 0; i < openTicks.length; ++i) {
            concs.push(buildConcentrated(openTicks[i], closeTicks[i], concLiqs[i]))
        }
        
        return { ambient: { isAdd: ambientLiq > 0,
            liquidity: BigNumber.from(ambientLiq).abs() }, concentrated: concs }
    }

    function buildConcentrated (openTick: number, closeTicks: number[],
        concLiqs: number[]): ConcentratedDirective {
        let bookends: ConcentratedBookend[] = []
        for (let i = 0; i < closeTicks.length; ++i) {
            bookends.push({closeTick: closeTicks[i], 
                isAdd: concLiqs[i] > 0, liquidity: BigNumber.from(concLiqs[i]).abs()})
        }        
        return { openTick: openTick, bookends: bookends }
    }

    it ("open settlement", async() => {
        await encoder.testEncodeOpen(encodeOrderDirective(order))
        let settle = (await encoder.settleOpen())
        expect(settle.token_).to.equal(ethers.utils.hexZeroPad(order.open.token, 20))
        expect(settle.limitQty_).to.equal(order.open.limitQty)
        expect(settle.dustThresh_).to.equal(order.open.dustThresh)
        expect(settle.useReserves_).to.equal(order.open.useReserves)
    })

    it ("hop settlement", async() => {
        await encoder.testEncodeHop(1, encodeOrderDirective(order))
        let settle = (await encoder.settleHop())
        let cmp = order.hops[1].settlement
        expect(settle.token_).to.equal(ethers.utils.hexZeroPad(cmp.token, 20))
        expect(settle.limitQty_).to.equal(cmp.limitQty)
        expect(settle.dustThresh_).to.equal(cmp.dustThresh)
        expect(settle.useReserves_).to.equal(cmp.useReserves)
    })

    it ("hop improve", async() => {
        await encoder.testEncodeHop(0, encodeOrderDirective(order))
        let improve = (await encoder.priceImprove())
        let chain = (await encoder.chaining())
        let cmp = order.hops[0]
        expect(improve.isEnabled_).to.equal(cmp.improve.isEnabled)
        expect(improve.useBaseSide_).to.equal(cmp.improve.useBaseSide)
        expect(chain.rollExit_).to.equal(cmp.chain.rollExit)
        expect(chain.swapDefer_).to.equal(cmp.chain.swapDefer)
        
        await encoder.testEncodeHop(1, encodeOrderDirective(order))
        improve = (await encoder.priceImprove())
        chain = (await encoder.chaining())
        cmp = order.hops[1]
        expect(improve.isEnabled_).to.equal(cmp.improve.isEnabled)
        expect(improve.useBaseSide_).to.equal(cmp.improve.useBaseSide)
        expect(chain.rollExit_).to.equal(cmp.chain.rollExit)
        expect(chain.swapDefer_).to.equal(cmp.chain.swapDefer)

        await encoder.testEncodeHop(2, encodeOrderDirective(order))
        improve = (await encoder.priceImprove())
        chain = (await encoder.chaining())
        cmp = order.hops[2]
        expect(improve.isEnabled_).to.equal(cmp.improve.isEnabled)
        expect(improve.useBaseSide_).to.equal(cmp.improve.useBaseSide)
        expect(chain.rollExit_).to.equal(cmp.chain.rollExit)
        expect(chain.swapDefer_).to.equal(cmp.chain.swapDefer)

        await encoder.testEncodeHop(3, encodeOrderDirective(order))
        improve = (await encoder.priceImprove())
        chain = (await encoder.chaining())
        cmp = order.hops[3]
        expect(improve.isEnabled_).to.equal(cmp.improve.isEnabled)
        expect(improve.useBaseSide_).to.equal(cmp.improve.useBaseSide)
        expect(chain.rollExit_).to.equal(cmp.chain.rollExit)
        expect(chain.swapDefer_).to.equal(cmp.chain.swapDefer)
    })

    it ("pool idx", async() => {
        await encoder.testEncodePool(2, 1, encodeOrderDirective(order))
        let cmp = order.hops[2].pools[1]
        expect((await encoder.poolIdx())).to.equal(cmp.poolIdx)
    })

    it ("swap", async() => {
        await encoder.testEncodePool(0, 1, encodeOrderDirective(order))
        let cmp = order.hops[0].pools[1].swap
        let swap = (await encoder.swap())
        expect(swap.isBuy_).to.equal(cmp.isBuy)
        expect(swap.inBaseQty_).to.equal(cmp.inBaseQty)
        expect(swap.liqMask_).to.equal(cmp.liqMask)
        expect(swap.limitPrice_).to.equal(cmp.limitPrice)
        expect(swap.qty_).to.equal(cmp.qty)                
    })

    it ("ambient", async() => {
        await encoder.testEncodePool(0, 2, encodeOrderDirective(order))
        let cmp = order.hops[0].pools[2]
        expect((await encoder.ambientOpen()).liquidity_).to.equal(cmp.passive.ambient.liquidity)
        expect((await encoder.ambientClose()).liquidity_).to.equal(cmp.passivePost.ambient.liquidity)
        expect((await encoder.ambientOpen()).isAdd_).to.equal(cmp.passive.ambient.isAdd)
        expect((await encoder.ambientClose()).isAdd_).to.equal(cmp.passivePost.ambient.isAdd)

        await encoder.testEncodePool(1, 0, encodeOrderDirective(order))
        cmp = order.hops[1].pools[0]
        expect((await encoder.ambientOpen()).liquidity_).to.equal(cmp.passive.ambient.liquidity)
        expect((await encoder.ambientClose()).liquidity_).to.equal(cmp.passivePost.ambient.liquidity)
        expect((await encoder.ambientOpen()).isAdd_).to.equal(cmp.passive.ambient.isAdd)
        expect((await encoder.ambientClose()).isAdd_).to.equal(cmp.passivePost.ambient.isAdd)
    })

    it ("concentrated post", async() => {
        await encoder.testEncodePassivePost(2, 1, 1, 2, encodeOrderDirective(order))
        
        let cmp = order.hops[2].pools[1].passivePost.concentrated[1]
        let cmpEnd = cmp.bookends[2]
        
        expect((await encoder.openTick())).to.equal(cmp.openTick)
        expect((await encoder.bookend()).closeTick_).to.equal(cmpEnd.closeTick)
        expect((await encoder.bookend()).liquidity_).to.equal(cmpEnd.liquidity)
        expect((await encoder.bookend()).isAdd_).to.equal(cmpEnd.isAdd)
    })

    it ("concentrated", async() => {
        await encoder.testEncodePassive(0, 1, 0, 1, encodeOrderDirective(order))
        let cmp = order.hops[0].pools[1].passive.concentrated[0]
        let cmpEnd = cmp.bookends[1]
        
        expect((await encoder.openTick())).to.equal(cmp.openTick)
        expect((await encoder.bookend()).closeTick_).to.equal(cmpEnd.closeTick)
        expect((await encoder.bookend()).liquidity_).to.equal(cmpEnd.liquidity)
        expect((await encoder.bookend()).isAdd_).to.equal(cmpEnd.isAdd)
    })
})