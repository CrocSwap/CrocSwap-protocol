import { TestEncoding } from '../typechain/TestEncoding';
import { expect } from "chai";
import chai from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import { toFixedGrowth, toSqrtPrice, fromSqrtPrice } from './FixedPoint';
import { OrderDirective, PassiveDirective, SwapDirective, PoolDirective, ConcentratedBookend, ConcentratedDirective, SettlementDirective, HopDirective, encodeOrderDirective } from './EncodeOrder';
import { BigNumber } from 'ethers';
import { CompilationJobCreationErrorReason } from 'hardhat/types';

chai.use(solidity);

describe('Tick Math', () => {
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
            buildPassive(281*1024, [200], [[]], [[]]),
            buildSwap(100, true, true, 7500000, 95.0),
            buildPassive(280*1024, [-5000], [[-6000, 4000]], [[300*1024, 400*1024]]))
        let poolN = buildPool(128, 
            buildPassive(281*1024, [200], [[]], [[]]),
            buildSwap(0, false, false, 0, 0),
            buildPassive(280*1024, [-5000], [[-6000, 4000]], [[300*1024, 400*1024]]))
        let poolQ = buildPool(250, emptyPassive(),
            buildSwap(0, true, false, 50000, 0.0625), emptyPassive())
        let poolR = buildPool(0, buildAmbientOnly(25000),
            buildSwap(1, false, true, 80000, 64000),
            buildPassive(0, [900, -800, 25], [[-1], [50, 25, 35], [10, 5]], 
                [[5675*1024], [5689*1024, 50000000*1024, 10*1024], [9*1024, 80*1024]]))

        
        let hopA = buildHop(buildSettle("DE0", 65000, 10, false),
            [poolJ, poolK, poolL])
        let hopB = buildHop(buildSettle("9A8", -50000, 15, false),
            [poolM, poolN])
        let hopC = buildHop(buildSettle("7C5", -800000, 5000, true),
            [poolQ, poolR])
        return { open: buildSettle("A25", 512, 128, true),
            hops: [hopA, hopB, hopC] }
    }

    function buildHop (settle: SettlementDirective, 
        pools: PoolDirective[]): HopDirective {
        return { pools: pools, settlement: settle }
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

    function buildSwap (liqMask: number, isBuy: boolean, quoteToBase: boolean, 
        qty: number, price: number): SwapDirective {
        return { liqMask: liqMask, isBuy: isBuy, quoteToBase: quoteToBase,
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
        
        return { ambient: { liquidity: BigNumber.from(ambientLiq) }, concentrated: concs }
    }

    function buildConcentrated (openTick: number, closeTicks: number[],
        concLiqs: number[]): ConcentratedDirective {
        let bookends: ConcentratedBookend[] = []
        for (let i = 0; i < closeTicks.length; ++i) {
            bookends.push({closeTick: closeTicks[i], liquidity: BigNumber.from(concLiqs[i])})
        }        
        return { openTick: openTick, bookends: bookends }
    }

    it ("open settle", async() => {
        await encoder.testEncodeOpen(encodeOrderDirective(order))
        console.log((await encoder.settleOpen))
    })
})