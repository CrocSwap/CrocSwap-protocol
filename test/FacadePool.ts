import { TestDex } from '../typechain/TestDex'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, ZERO_ADDR } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { OrderDirective, PassiveDirective, SwapDirective, PoolDirective, ConcentratedBookend, ConcentratedDirective, SettlementDirective, HopDirective, encodeOrderDirective } from './EncodeOrder';
import { MockERC20 } from '../typechain/MockERC20';
import { CrocSwapDex } from '../typechain/CrocSwapDex';
import { Signer, ContractFactory, BigNumber, ContractTransaction, BytesLike } from 'ethers';
import { simpleSettle, singleHop, simpleMint, simpleSwap } from './EncodeSimple';
import { MockPermit } from '../typechain/MockPermit';
import { QueryHelper } from '../typechain/QueryHelper';

chai.use(solidity);

const INIT_BAL = 1000000000
const POOL_IDX = 85365

export class TestPool {
    dex: Promise<CrocSwapDex>
    query: Promise<QueryHelper>
    trader: Promise<Signer>
    auth: Promise<Signer>
    other: Promise<Signer>
    permit: Promise<MockPermit>
    base: Promise<MockERC20>
    quote: Promise<MockERC20>
    baseSnap: Promise<BigNumber>
    quoteSnap: Promise<BigNumber>
    useHotPath: boolean

    constructor() {
        let factory = ethers.getContractFactory("MockERC20") as Promise<ContractFactory>
        let tokenX = factory.then(f => f.deploy()) as Promise<MockERC20>
        let tokenY = factory.then(f => f.deploy()) as Promise<MockERC20>

        this.base = sortBaseToken(tokenX, tokenY)
        this.quote = sortQuoteToken(tokenX, tokenY)

        factory = ethers.getContractFactory("MockPermit") as Promise<ContractFactory>
        this.permit = factory.then(f => f.deploy()) as Promise<MockPermit>

        let accts = ethers.getSigners() as Promise<Signer[]>
        this.trader = accts.then(a => a[0])
        this.auth = accts.then(a => a[1])
        this.other = accts.then(a => a[2])

        factory = ethers.getContractFactory("CrocSwapDexSeed")
        this.dex = factory.then(f => this.auth.then(a => 
            f.deploy(a.getAddress()))) as Promise<CrocSwapDex>

        factory = ethers.getContractFactory("QueryHelper")
        this.query = factory.then(f => this.dex.then(
            d => f.deploy(d.address))) as Promise<QueryHelper>
    
        this.baseSnap = Promise.resolve(BigNumber.from(0))
        this.quoteSnap = Promise.resolve(BigNumber.from(0))

        this.useHotPath = true;
    }

    async fundTokens() {
        await fundToken(this.base, this.trader, this.dex)
        await fundToken(this.quote, this.trader, this.dex)
        await fundToken(this.base, this.other, this.dex)
        await fundToken(this.quote, this.other, this.dex)
        this.baseSnap = this.traderBalance(this.base)
        this.quoteSnap = this.traderBalance(this.quote)
    }

    async initPool (feeRate: number, protoTake: number, tickSize: number,
        price: number): Promise<ContractTransaction> {
        await (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.encodeProtocolCmd(
                66, ZERO_ADDR, ZERO_ADDR, POOL_IDX, feeRate, protoTake, 
                tickSize, 0))
        let gasTx = await (await this.dex)
            .initPool((await this.base).address, (await this.quote).address, POOL_IDX, 
                toSqrtPrice(price))
        await this.testPegPriceImprove(1024*1024*1024*1024, 50)

        this.baseSnap = this.traderBalance(this.base)
        this.quoteSnap = this.traderBalance(this.quote)
        return gasTx
    }

    async initPermitPool (feeRate: number, protoTake: number, tickSize: number,
        price: number) {
        await (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.encodeProtocolCmd(
                66, (await this.permit).address, ZERO_ADDR, POOL_IDX, feeRate, protoTake, tickSize, 0))
        await (await this.dex)
            .initPool((await this.base).address, (await this.quote).address, POOL_IDX, 
                toSqrtPrice(price))
    }

    encodeProtocolCmd (code: number, token: string, sidecar: string, poolIdx: number, 
        feeRate: number, protoTake: number, ticks: number, value: number): BytesLike {
        let abiCoder = new ethers.utils.AbiCoder()
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint24", "uint24", "uint8", "uint16", "uint128" ], 
            [ code, token, sidecar, poolIdx, feeRate, protoTake, ticks, value ]);
    }

    async encodeMintPath (lower: number, upper: number, liq: number): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = 1
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint24", "int24", "int24", "uint128" ], 
            [ callCode, base, quote, POOL_IDX, lower, upper, liq  ]);
    }

    async encodeBurnPath (lower: number, upper: number, liq: number): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = 2
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint24", "int24", "int24", "uint128" ], 
            [ callCode, base, quote, POOL_IDX, lower, upper, liq  ]);
    }

    async testMint (lower: number, upper: number, liq: number): Promise<ContractTransaction> {
        return this.testMintFrom(await this.trader, lower, upper, liq)
    }

    async testMintOther (lower: number, upper: number, liq: number): Promise<ContractTransaction> {
        return this.testMintFrom(await this.other, lower, upper, liq)
    }

    async testBurn (lower: number, upper: number, liq: number): Promise<ContractTransaction> {
        return this.testBurnFrom(await this.trader, lower, upper, liq)
    }

    async testBurnOther (lower: number, upper: number, liq: number): Promise<ContractTransaction> {
        return this.testBurnFrom(await this.other, lower, upper, liq)
    }

    async testSwap (isBuy: boolean, inBaseQty: boolean, qty: number, price: BigNumber): 
        Promise<ContractTransaction> {
        return this.testSwapFrom(await this.trader, isBuy, inBaseQty, qty, price)
    }

    async testSwapOther (isBuy: boolean, inBaseQty: boolean, qty: number, price: BigNumber): 
        Promise<ContractTransaction> {
        return this.testSwapFrom(await this.other, isBuy, inBaseQty, qty, price)
    }

    async testMintFrom (from: Signer, lower: number, upper: number, liq: number): Promise<ContractTransaction> {
        await this.snapStart()
        if (this.useHotPath) {
            let inputBytes = this.encodeMintPath(lower, upper, liq*1024)
            return (await this.dex).connect(from).tradeWarm(await inputBytes)
        } else {
            let directive = singleHop((await this.base).address,
            (await this.quote).address, simpleMint(POOL_IDX, lower, upper, liq*1024))
            let inputBytes = encodeOrderDirective(directive);
            return (await this.dex).connect(from).trade(inputBytes)
        }
    }

    async testBurnFrom (from: Signer, lower: number, upper: number, liq: number): Promise<ContractTransaction> {
        await this.snapStart()
        if (this.useHotPath) {
            let inputBytes = this.encodeBurnPath(lower, upper, liq*1024)
            return (await this.dex).connect(from).tradeWarm(await inputBytes)
        } else {
            let directive = singleHop((await this.base).address,
            (await this.quote).address, simpleMint(POOL_IDX, lower, upper, -liq*1024))
            let inputBytes = encodeOrderDirective(directive);
            return (await this.dex).connect(from).trade(inputBytes)
        }
    }

    async testSwapFrom (from: Signer, isBuy: boolean, inBaseQty: boolean, qty: number, price: BigNumber): Promise<ContractTransaction> {
        await this.snapStart()
        if (this.useHotPath) {
            return (await this.dex).connect(from).swap((await this.base).address,
                (await this.quote).address, POOL_IDX, isBuy, inBaseQty, qty, price)
        } else {
            let directive = singleHop((await this.base).address,
                (await this.quote).address, simpleSwap(POOL_IDX, isBuy, inBaseQty, Math.abs(qty), price))
            let inputBytes = encodeOrderDirective(directive);
            return (await this.dex).connect(from).trade(inputBytes)
        }
    }

    async testRevisePool (feeRate: number, protoTake: number, tickSize:number): Promise<ContractTransaction> {
        return (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.encodeProtocolCmd(68, (await this.base).address, 
                (await this.quote).address, POOL_IDX, feeRate, protoTake, 1, 0))
    }

    async testPegPriceImprove (collateral: number, awayTick: number): Promise<ContractTransaction> {
        return (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.encodeProtocolCmd(69, (await this.base).address, ZERO_ADDR,
                POOL_IDX, 0, 0, awayTick, collateral))
    }

    async snapBaseOwed(): Promise<BigNumber> {
        let lastSnap = await this.baseSnap
        this.baseSnap = this.traderBalance(this.base)
        return lastSnap.sub(await this.baseSnap)
    }

    async snapQuoteOwed(): Promise<BigNumber> {
        let lastSnap = await this.quoteSnap
        this.quoteSnap = this.traderBalance(this.quote)
        return lastSnap.sub(await this.quoteSnap)
    }

    async snapStart() {
        await this.snapBaseOwed();
        await this.snapQuoteOwed();
    }

    async snapBaseFlow(): Promise<BigNumber> {
        return (await this.snapBaseOwed())
    }

    async snapQuoteFlow(): Promise<BigNumber> {
        return (await this.snapQuoteOwed())
    }

    async liquidity(): Promise<BigNumber> {
        return await (await this.query).queryLiquidity
            ((await this.base).address, (await this.quote).address, POOL_IDX)
    }

    async price(): Promise<BigNumber> {
        return (await (await this.query).queryCurve
            ((await this.base).address, (await this.quote).address, POOL_IDX))
            .priceRoot_
    }

    async traderBalance (token: Promise<MockERC20>): Promise<BigNumber> {
        let addr = (await (await this.trader).getAddress())
        return (await token).balanceOf(addr)
    }
}

async function fundToken (token: Promise<MockERC20>, trader: Promise<Signer>, 
    dex: Promise<CrocSwapDex>) {
    let tokenR = await token
    let traderR = await trader
    await tokenR.deposit(await traderR.getAddress(), INIT_BAL)
    await tokenR.approveFor(await traderR.getAddress(), (await dex).address, INIT_BAL)
}

export async function sortBaseToken (tokenX: Promise<MockERC20>, tokenY: Promise<MockERC20>):
    Promise<MockERC20> {
    return addrLessThan((await tokenX).address, (await tokenY).address) ?
        tokenX : tokenY;
}

export async function sortQuoteToken (tokenX: Promise<MockERC20>, tokenY: Promise<MockERC20>):
    Promise<MockERC20> {
    return addrLessThan((await tokenX).address, (await tokenY).address) ?
        tokenY : tokenX;
}

export function addrLessThan (addrX: string, addrY: string): boolean {
    return addrX.toLowerCase().localeCompare(addrY.toLowerCase()) < 0
}
