import { TestDex } from '../typechain/TestDex'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { OrderDirective, PassiveDirective, SwapDirective, PoolDirective, ConcentratedBookend, ConcentratedDirective, SettlementDirective, HopDirective, encodeOrderDirective } from './EncodeOrder';
import { MockERC20 } from '../typechain/MockERC20';
import { CrocSwapDex } from '../typechain/CrocSwapDex';
import { CrocSwapSidecar } from '../typechain/CrocSwapSidecar';
import { Signer, ContractFactory, BigNumber } from 'ethers';
import { simpleSettle, singleHop, simpleMint } from './EncodeSimple';

chai.use(solidity);

const INIT_BAL = 1000000000
const POOL_IDX = 85365

export class TestPool {
    dex: Promise<CrocSwapDex>
    sidecar: Promise<CrocSwapSidecar>
    trader: Promise<Signer>
    auth: Promise<Signer>
    base: Promise<MockERC20>
    quote: Promise<MockERC20>
    baseSnap: Promise<BigNumber>
    quoteSnap: Promise<BigNumber>

    constructor() {
        let factory = ethers.getContractFactory("MockERC20") as Promise<ContractFactory>
        this.base = factory.then(f => f.deploy()) as Promise<MockERC20>
        this.quote = factory.then(f => f.deploy()) as Promise<MockERC20>

        let accts = ethers.getSigners() as Promise<Signer[]>
        this.trader = accts.then(a => a[0])
        this.auth = accts.then(a => a[1])

        factory = ethers.getContractFactory("CrocSwapDex")
        this.dex = factory.then(f => this.auth.then(a => 
            f.deploy(a.getAddress()))) as Promise<CrocSwapDex>

        factory = ethers.getContractFactory("CrocSwapSidecar")
        this.sidecar = factory.then(f => this.dex.then(d => 
                d.getSidecar()).then(a =>
                f.attach(a))) as Promise<CrocSwapSidecar>
    
        this.baseSnap = Promise.resolve(BigNumber.from(0))
        this.quoteSnap = Promise.resolve(BigNumber.from(0))
    }

    async fundTokens() {
        await fundToken(this.base, this.trader, this.dex)
        await fundToken(this.quote, this.trader, this.dex)
        this.baseSnap = (await this.base).balanceOf((await this.dex).address)
        this.quoteSnap = (await this.quote).balanceOf((await this.dex).address)
    }

    async initPool (feeRate: number, protoTake: number, tickSize: number,
        price: number) {
        await (await this.sidecar)
            .connect(await this.auth)
            .setInitLock(0)
        await (await this.dex)
            .connect(await this.auth)
            .setPoolTemplate(POOL_IDX, feeRate, protoTake, tickSize)
        await (await this.dex)
            .initPool((await this.base).address, (await this.quote).address, POOL_IDX, 
                toSqrtPrice(price))
        
        this.baseSnap = (await this.base).balanceOf((await this.dex).address)
        this.quoteSnap = (await this.quote).balanceOf((await this.dex).address)                
    }

    async testMint (lower: number, upper: number, liq: number) {
        let directive = singleHop((await this.base).address,
            (await this.quote).address, simpleMint(POOL_IDX, lower, upper, liq*1024))
        let inputBytes = encodeOrderDirective(directive);
        await (await this.dex).connect(await this.trader).trade(inputBytes)
    }

    async snapBaseOwed(): Promise<BigNumber> {
        let lastSnap = await this.baseSnap
        this.baseSnap = (await this.base).balanceOf((await this.dex).address)
        return (await this.baseSnap).sub(lastSnap)
    }

    async snapQuoteOwed(): Promise<BigNumber> {
        let lastSnap = await this.quoteSnap
        this.quoteSnap = (await this.quote).balanceOf((await this.dex).address)
        return (await this.quoteSnap).sub(lastSnap)
    }

    async liquidity(): Promise<BigNumber> {
        return await (await this.dex).queryLiquidity
            ((await this.base).address, (await this.quote).address, POOL_IDX)
    }

    async price(): Promise<BigNumber> {
        return (await (await this.dex).queryCurve
            ((await this.base).address, (await this.quote).address, POOL_IDX))
            .priceRoot_
    }
}

async function fundToken (token: Promise<MockERC20>, trader: Promise<Signer>, 
    dex: Promise<CrocSwapDex>) {
    let tokenR = await token
    let traderR = await trader
    await tokenR.deposit(await traderR.getAddress(), INIT_BAL)
    await tokenR.approveFor(await traderR.getAddress(), (await dex).address, INIT_BAL)
}
