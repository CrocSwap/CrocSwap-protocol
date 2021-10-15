import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, ZERO_ADDR } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { OrderDirective, PassiveDirective, SwapDirective, PoolDirective, ConcentratedBookend, ConcentratedDirective, SettlementDirective, HopDirective, encodeOrderDirective } from './EncodeOrder';
import { MockERC20 } from '../typechain/MockERC20';
import { CrocSwapDex } from '../typechain/CrocSwapDex';
import { Signer, ContractFactory, BigNumber, ContractTransaction, BytesLike, Contract, PayableOverrides } from 'ethers';
import { simpleSettle, singleHop, simpleMint, simpleSwap, simpleMintAmbient } from './EncodeSimple';
import { MockPermit } from '../typechain/MockPermit';
import { QueryHelper } from '../typechain/QueryHelper';
import { TestSettleLayer } from "../typechain/TestSettleLayer";

chai.use(solidity);

const INIT_BAL = 1000000000
const POOL_IDX = 85365

export async function makeTokenPool(): Promise<TestPool> {
    let factory = await ethers.getContractFactory("MockERC20") as ContractFactory
    let tokenX = await factory.deploy() as MockERC20
    let tokenY = await factory.deploy() as MockERC20

    let base = sortBaseToken(tokenX, tokenY)
    let quote = sortQuoteToken(tokenX, tokenY)

    let pool = new TestPool(new ERC20Token(await base), new ERC20Token(await quote))
    await pool.fundTokens()
    return pool
}

export async function makeEtherPool(): Promise<TestPool> {
    let factory = await ethers.getContractFactory("MockERC20") as ContractFactory
    let quote = await factory.deploy() as MockERC20

    let pool = new TestPool(new NativeEther(), new ERC20Token(await quote))
    await pool.fundTokens()
    return pool
}

export interface Token {
    address: string
    balanceOf: (address: string) => Promise<BigNumber>
    fund: (s: Signer, dex: string, val: number) => Promise<void>
    sendEth: boolean
}

class ERC20Token implements Token {
    address: string
    contract: MockERC20
    sendEth: boolean

    constructor (token: MockERC20) {
        this.address = token.address
        this.contract = token
        this.sendEth = false;
    }

    async balanceOf(address: string): Promise<BigNumber> {
        return this.contract.balanceOf(address)
    }

    async fund (s: Signer, dex: string, val: number): Promise<void> {
        await this.contract.deposit(await s.getAddress(), BigNumber.from(val))
        await this.contract.approveFor(await s.getAddress(), dex, BigNumber.from(val))
    }
}

class NativeEther implements Token {
    address: string
    balanceFinder: Promise<TestSettleLayer>
    sendEth: boolean

    constructor() {
        this.address = ZERO_ADDR
        let factory = ethers.getContractFactory("TestSettleLayer") as Promise<ContractFactory>
        this.balanceFinder = factory.then(f => f.deploy(ZERO_ADDR)) as Promise<TestSettleLayer>
        this.sendEth = true;
    }

    async balanceOf(address: string): Promise<BigNumber> {
        return await this.balanceFinder.then(b => b.getBalance(address))
    }

    async fund (s: Signer, dex: string, val: number): Promise<void> {
        // Signed should already be funded
    }
}


export class TestPool {
    dex: Promise<CrocSwapDex>
    query: Promise<QueryHelper>
    trader: Promise<Signer>
    auth: Promise<Signer>
    other: Promise<Signer>
    permit: Promise<MockPermit>
    base: Token
    quote: Token
    baseSnap: Promise<BigNumber>
    quoteSnap: Promise<BigNumber>
    useHotPath: boolean
    overrides: PayableOverrides

    constructor (base: Token, quote: Token) {
        this.base = base
        this.quote = quote

        let factory = ethers.getContractFactory("MockPermit") as Promise<ContractFactory>
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

        this.useHotPath = false;

        this.overrides = base.sendEth || quote.sendEth ?
            { value: BigNumber.from(1000000000).mul(1000000000) } : { }
    }

    async fundTokens() {
        await this.base.fund(await this.trader, (await this.dex).address, INIT_BAL)
        await this.quote.fund(await this.trader, (await this.dex).address, INIT_BAL)
        await this.base.fund(await this.other, (await this.dex).address, INIT_BAL)
        await this.quote.fund(await this.other, (await this.dex).address, INIT_BAL)
        this.baseSnap = this.base.balanceOf(await (await this.trader).getAddress())
        this.quoteSnap = this.quote.balanceOf(await (await this.trader).getAddress())
    }

    async initPool (feeRate: number, protoTake: number, tickSize: number,
        price: number, noOverrides?: boolean): Promise<ContractTransaction> {
        let overrides = noOverrides ? {} : this.overrides 
        await (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.encodeProtocolCmd(
                66, ZERO_ADDR, ZERO_ADDR, POOL_IDX, feeRate, protoTake, 
                tickSize, 0))
        let gasTx = await (await this.dex)
            .initPool((await this.base).address, (await this.quote).address, POOL_IDX, 
                toSqrtPrice(price), overrides)
        await this.testPegPriceImprove(1024*1024*1024*1024, 50)

        this.baseSnap = this.base.balanceOf(await (await this.trader).getAddress())
        this.quoteSnap = this.quote.balanceOf(await (await this.trader).getAddress())
        return gasTx
    }

    async initPermitPool (feeRate: number, protoTake: number, tickSize: number,
        price: number) {
        await (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.encodeProtocolCmd(
                66, (await this.permit).address, (await this.permit).address, POOL_IDX, 
                feeRate, protoTake, tickSize, 0))
        await (await this.dex)
            .initPool((await this.base).address, (await this.quote).address, POOL_IDX, 
                toSqrtPrice(price), this.overrides)
    }

    async testSetInitLiq (initLiq: number) {
        await (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.encodeProtocolCmd(
                68, ZERO_ADDR, ZERO_ADDR, POOL_IDX, 0, 0, 0, initLiq)) 
    }    

    encodeProtocolCmd (code: number, token: string, sidecar: string, poolIdx: number, 
        feeRate: number, protoTake: number, ticks: number, value: number): BytesLike {
        let abiCoder = new ethers.utils.AbiCoder()
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint24", "uint24", "uint8", "uint16", "uint128" ], 
            [ code, token, sidecar, poolIdx, feeRate, protoTake, ticks, value ]);
    }

    async encodeMintPath (lower: number, upper: number, liq: number, useSurplus: boolean): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = 1
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint24", "int24", "int24", "uint128", "bool" ], 
            [ callCode, base, quote, POOL_IDX, lower, upper, liq, useSurplus  ]);
    }

    async encodeBurnPath (lower: number, upper: number, liq: number, useSurplus: boolean): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = 2
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint24", "int24", "int24", "uint128", "bool" ], 
            [ callCode, base, quote, POOL_IDX, lower, upper, liq, useSurplus  ]);
    }

    async encodeMintAmbientPath (liq: number, useSurplus: boolean): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = 3
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint24", "int24", "int24", "uint128", "bool" ], 
            [ callCode, base, quote, POOL_IDX, 0, 0, liq, useSurplus  ]);
    }

    async encodeBurnAmbientPath (liq: number, useSurplus: boolean): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = 4
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint24", "int24", "int24", "uint128", "bool" ], 
            [ callCode, base, quote, POOL_IDX, 0, 0, liq, useSurplus  ]);
    }

    async testMint (lower: number, upper: number, liq: number, useSurplus?: boolean): Promise<ContractTransaction> {
        return this.testMintFrom(await this.trader, lower, upper, liq, useSurplus)
    }

    async testMintAmbient (liq: number, useSurplus?: boolean): Promise<ContractTransaction> {
        return this.testMintAmbientFrom(await this.trader, liq, useSurplus)
    }

    async testMintOther (lower: number, upper: number, liq: number, useSurplus?: boolean): Promise<ContractTransaction> {
        return this.testMintFrom(await this.other, lower, upper, liq, useSurplus)
    }

    async testBurn (lower: number, upper: number, liq: number, useSurplus?: boolean): Promise<ContractTransaction> {
        return this.testBurnFrom(await this.trader, lower, upper, liq, useSurplus)
    }

    async testBurnAmbient (liq: number, useSurplus?: boolean): Promise<ContractTransaction> {
        return this.testBurnAmbientFrom(await this.trader, liq, useSurplus)
    }

    async testBurnOther (lower: number, upper: number, liq: number): Promise<ContractTransaction> {
        return this.testBurnFrom(await this.other, lower, upper, liq)
    }

    async testSwap (isBuy: boolean, inBaseQty: boolean, qty: number, price: BigNumber): 
        Promise<ContractTransaction> {
        return this.testSwapFrom(await this.trader, isBuy, inBaseQty, qty, price)
    }

    async testSwapSurplus (isBuy: boolean, inBaseQty: boolean, qty: number, price: BigNumber): 
        Promise<ContractTransaction> {
        return this.testSwapFrom(await this.trader, isBuy, inBaseQty, qty, price, true)
    }

    async testSwapOther (isBuy: boolean, inBaseQty: boolean, qty: number, price: BigNumber): 
        Promise<ContractTransaction> {
        return this.testSwapFrom(await this.other, isBuy, inBaseQty, qty, price)
    }

    async testMintFrom (from: Signer, lower: number, upper: number, liq: number, useSurplus: boolean = false): Promise<ContractTransaction> {
        await this.snapStart()
        if (this.useHotPath) {
            let inputBytes = this.encodeMintPath(lower, upper, liq*1024, useSurplus)
            return (await this.dex).connect(from).tradeWarm(await inputBytes, this.overrides)
        } else {
            let directive = singleHop((await this.base).address,
            (await this.quote).address, simpleMint(POOL_IDX, lower, upper, liq*1024))
            let inputBytes = encodeOrderDirective(directive);
            return (await this.dex).connect(from).trade(inputBytes, this.overrides)
        }
    }

    async testBurnFrom (from: Signer, lower: number, upper: number, liq: number, useSurplus: boolean = false): Promise<ContractTransaction> {
        await this.snapStart()
        if (this.useHotPath) {
            let inputBytes = this.encodeBurnPath(lower, upper, liq*1024, useSurplus)
            return (await this.dex).connect(from).tradeWarm(await inputBytes, this.overrides)
        } else {
            let directive = singleHop((await this.base).address,
            (await this.quote).address, simpleMint(POOL_IDX, lower, upper, -liq*1024))
            let inputBytes = encodeOrderDirective(directive);
            return (await this.dex).connect(from).trade(inputBytes, this.overrides)
        }
    }

    async testBurnAmbientFrom (from: Signer, liq: number, useSurplus: boolean = false): Promise<ContractTransaction> {
        await this.snapStart()
        if (this.useHotPath) {
            let inputBytes = this.encodeBurnAmbientPath(liq*1024, useSurplus)
            return (await this.dex).connect(from).tradeWarm(await inputBytes, this.overrides)
        } else {
            let directive = singleHop((await this.base).address,
            (await this.quote).address, simpleMintAmbient(POOL_IDX, -liq*1024))
            let inputBytes = encodeOrderDirective(directive);
            return (await this.dex).connect(from).trade(inputBytes, this.overrides)
        }
    }

    async testMintAmbientFrom (from: Signer, liq: number, useSurplus: boolean = false): Promise<ContractTransaction> {
        await this.snapStart()
        if (this.useHotPath) {
            let inputBytes = this.encodeMintAmbientPath(liq*1024, useSurplus)
            return (await this.dex).connect(from).tradeWarm(await inputBytes, this.overrides)
        } else {
            let directive = singleHop((await this.base).address,
            (await this.quote).address, simpleMintAmbient(POOL_IDX, liq*1024))
            let inputBytes = encodeOrderDirective(directive);
            return (await this.dex).connect(from).trade(inputBytes, this.overrides)
        }
    }

    async testSwapFrom (from: Signer, isBuy: boolean, inBaseQty: boolean, qty: number, price: BigNumber,
        useSurplus: boolean = false): Promise<ContractTransaction> {
        await this.snapStart()
        if (this.useHotPath) {
            return (await this.dex).connect(from).swap((await this.base).address,
                (await this.quote).address, POOL_IDX, isBuy, inBaseQty, qty, price, useSurplus, this.overrides)
        } else {
            let directive = singleHop((await this.base).address,
                (await this.quote).address, simpleSwap(POOL_IDX, isBuy, inBaseQty, Math.abs(qty), price))
            let inputBytes = encodeOrderDirective(directive);
            return (await this.dex).connect(from).trade(inputBytes, this.overrides)
        }
    }

    async testOrder (order: OrderDirective, noOverrides?: boolean): Promise<ContractTransaction> {
        let override = noOverrides ? {} : this.overrides
        await this.snapStart();
        return (await this.dex).connect(await this.trader)
            .trade(encodeOrderDirective(order), override)
    }

    async testRevisePool (feeRate: number, protoTake: number, tickSize:number): Promise<ContractTransaction> {
        return (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.encodeProtocolCmd(67, (await this.base).address, 
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
        this.baseSnap = this.base.balanceOf(await (await this.trader).getAddress())
        return lastSnap.sub(await this.baseSnap)
    }

    async snapQuoteOwed(): Promise<BigNumber> {
        let lastSnap = await this.quoteSnap
        this.quoteSnap = this.quote.balanceOf(await (await this.trader).getAddress())
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

    async prototypeOrder(): Promise<OrderDirective> {
        return singleHop((await this.base).address,
            (await this.quote).address, simpleMintAmbient(POOL_IDX, 0))
    }
}

export async function sortBaseToken (tokenX: MockERC20, tokenY: MockERC20):
    Promise<MockERC20> {
    return addrLessThan((await tokenX).address, (await tokenY).address) ?
        tokenX : tokenY;
}

export async function sortQuoteToken (tokenX: MockERC20, tokenY: MockERC20):
    Promise<MockERC20> {
    return addrLessThan((await tokenX).address, (await tokenY).address) ?
        tokenY : tokenX;
}

export function addrLessThan (addrX: string, addrY: string): boolean {
    return addrX.toLowerCase().localeCompare(addrY.toLowerCase()) < 0
}
