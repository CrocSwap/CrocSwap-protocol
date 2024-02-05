import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, ZERO_ADDR } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { OrderDirective, PassiveDirective, SwapDirective, PoolDirective, encodeOrderDirective } from './EncodeOrder';
import { MockERC20 } from '../typechain/MockERC20';
import { CrocSwapDex } from '../typechain/CrocSwapDex';
import { Signer, ContractFactory, BigNumber, ContractTransaction, BytesLike, Contract, PayableOverrides, Bytes, BigNumberish } from 'ethers';
import { simpleSettle, singleHop, simpleMint, simpleSwap, simpleMintAmbient, singleHopPools, doubleHop } from './EncodeSimple';
import { MockPermit } from '../typechain/MockPermit';
import { QueryHelper } from '../typechain/QueryHelper';
import { TestSettleLayer } from "../typechain/TestSettleLayer";
import { CrocQuery } from "../typechain/CrocQuery";
import { BootPath } from "../typechain";
import { buildCrocSwapSex } from "./SetupDex";

chai.use(solidity);

const MAX_LIMIT = BigNumber.from("10").pow(21)
const MIN_LIMIT = BigNumber.from("0")
const INIT_BAL = 1000000000
export const POOL_IDX = 85365

export async function makeTokenPool(): Promise<TestPool> {
    let factory = await ethers.getContractFactory("MockERC20") as ContractFactory
    let tokenX = new ERC20Token((await factory.deploy() as MockERC20))
    let tokenY = new ERC20Token((await factory.deploy() as MockERC20))

    return makePoolFrom(tokenX, tokenY)
}

export async function makeTokenSeq(): Promise<TestPool[]> {
    let factory = await ethers.getContractFactory("MockERC20") as ContractFactory
    let tokenW = new ERC20Token((await factory.deploy() as MockERC20))
    let tokenX = new ERC20Token((await factory.deploy() as MockERC20))
    let tokenY = new ERC20Token((await factory.deploy() as MockERC20))
    let tokenZ = new ERC20Token((await factory.deploy() as MockERC20))

    let tokens = [tokenW, tokenX, tokenY, tokenZ]
    tokens.sort((x,y) => (x.address.localeCompare(y.address)))

    let poolM = await makePoolFrom(tokens[0], tokens[1])
    let poolN = await makePoolFrom(tokens[1], tokens[2], await poolM.dex)
    let poolO = await makePoolFrom(tokens[2], tokens[3], await poolM.dex)
    return [poolM, poolN, poolO] 
}

export async function makeTokenTriangle(): Promise<TestPool[]> {
    let factory = await ethers.getContractFactory("MockERC20") as ContractFactory
    let tokenX = new ERC20Token((await factory.deploy() as MockERC20))
    let tokenY = new ERC20Token((await factory.deploy() as MockERC20))
    let tokenZ = new ERC20Token((await factory.deploy() as MockERC20))

    let tokens = [tokenX, tokenY, tokenZ]
    tokens.sort((x,y) => (x.address.localeCompare(y.address)))

    let poolM = await makePoolFrom(tokens[0], tokens[1])
    let poolN = await makePoolFrom(tokens[1], tokens[2], await poolM.dex)
    let poolO = await makePoolFrom(tokens[2], tokens[0], await poolM.dex)
    return [poolM, poolN, poolO] 
}

export async function makeTokenNext (pool: TestPool): Promise<TestPool> {
    let factory = await ethers.getContractFactory("MockERC20") as ContractFactory
    let tokenZ = new ERC20Token((await factory.deploy() as MockERC20))

    return makePoolFrom(pool.quote, tokenZ)
}

export async function makePoolFrom (tokenX: Token, tokenY: Token, dex?: CrocSwapDex): Promise<TestPool> {
    let base = sortBaseToken(tokenX, tokenY)
    let quote = sortQuoteToken(tokenX, tokenY)

    let pool = new TestPool(base, quote, dex)
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
    fund: (s: Signer, dex: string, val: BigNumberish) => Promise<void>
    sendEth: boolean
}

export class ERC20Token implements Token {
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

    async fund (s: Signer, dex: string, val: BigNumberish): Promise<void> {
        await this.contract.deposit(await s.getAddress(), BigNumber.from(val))
        await this.contract.approveFor(await s.getAddress(), dex, BigNumber.from(val))
    }
}

export class NativeEther implements Token {
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

    async fund (s: Signer, dex: string, val: BigNumberish): Promise<void> {
        // Signed should already be funded
    }
}

export class TestPool {
    dex: Promise<CrocSwapDex>
    query: Promise<CrocQuery>
    trader: Promise<Signer>
    auth: Promise<Signer>
    other: Promise<Signer>
    third: Promise<Signer>
    permit: Promise<MockPermit>
    base: Token
    quote: Token
    baseSnap: Promise<BigNumber>
    quoteSnap: Promise<BigNumber>
    useHotPath: boolean
    useSwapProxy: { optimal: boolean, base: boolean }
    lpConduit: string
    startLimit: BigNumber
    overrides: PayableOverrides
    knockoutBits: number
    poolIdx: BigNumberish
    liqQty: boolean
    liqBase: boolean
    initTemplBefore: boolean

    constructor (base: Token, quote: Token, dex?: CrocSwapDex) {
        this.base = base
        this.quote = quote
        this.poolIdx = POOL_IDX

        let factory = ethers.getContractFactory("MockPermit") as Promise<ContractFactory>
        this.permit = factory.then(f => f.deploy()) as Promise<MockPermit>

        let accts = ethers.getSigners() as Promise<Signer[]>
        this.trader = accts.then(a => a[0])
        this.auth = accts.then(a => a[1])
        this.other = accts.then(a => a[2])
        this.third = accts.then(a => a[3])        
        this.liqQty = false
        this.liqBase = true
        this.initTemplBefore = true

        factory = ethers.getContractFactory("CrocSwapDexSeed")
        if (dex) {
            this.dex = Promise.resolve(dex)
        } else {
            this.dex = buildCrocSwapSex(this.auth)
        }

        factory = ethers.getContractFactory("CrocQuery")
        this.query = factory.then(f => this.dex.then(
            d => f.deploy(d.address))) as Promise<CrocQuery>
    
        this.baseSnap = Promise.resolve(BigNumber.from(0))
        this.quoteSnap = Promise.resolve(BigNumber.from(0))

        this.useHotPath = false;
        this.useSwapProxy = { optimal: false, base: false }
        this.lpConduit = ZERO_ADDR
        this.startLimit = BigNumber.from(0)
        this.knockoutBits = 0

        this.overrides = base.sendEth || quote.sendEth ?
            { value: BigNumber.from(1000000000).mul(1000000000) } : { }
    }

    async fundTokens (bal: BigNumberish = INIT_BAL) {
        await this.base.fund(await this.trader, (await this.dex).address, bal)
        await this.quote.fund(await this.trader, (await this.dex).address, bal)
        await this.base.fund(await this.other, (await this.dex).address, bal)
        await this.quote.fund(await this.other, (await this.dex).address, bal)
        this.baseSnap = this.base.balanceOf(await (await this.trader).getAddress())
        this.quoteSnap = this.quote.balanceOf(await (await this.trader).getAddress())
    }

    async initPool (feeRate: number, protoTake: number, tickSize: number,
        price: number | BigNumber, noOverrides?: boolean): Promise<ContractTransaction> {
        return this.initPoolIdx(this.poolIdx, feeRate, protoTake, tickSize, price, noOverrides)
    }

    async initPoolIdx (poolIdx: BigNumberish, feeRate: number, protoTake: number, tickSize: number,
        price: number | BigNumber, noOverrides?: boolean): Promise<ContractTransaction> {
        let overrides = noOverrides ? {} : this.overrides 

        await this.setProtocolTake(protoTake)

        if (this.initTemplBefore) {
            await this.initTempl(feeRate, tickSize, poolIdx)
        }

        let gasTx = await (await this.dex)
            .connect(await this.trader)
            .userCmd(this.COLD_PROXY, await this.encodeInitPool(poolIdx, price), overrides)
        
        this.baseSnap = this.base.balanceOf(await (await this.trader).getAddress())
        this.quoteSnap = this.quote.balanceOf(await (await this.trader).getAddress())
        return gasTx
    }

    async initTempl (feeRate: number, tickSize: number, poolIdx?: BigNumberish): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "uint256", "uint16", "uint16", "uint8", "uint8", "uint8"],
            [110, poolIdx ? poolIdx : this.poolIdx, feeRate, tickSize, 0, this.knockoutBits, 0])

        return (await this.dex)
                .connect(await this.auth)
                .protocolCmd(this.COLD_PROXY, cmd, false)
    }

    async encodeInitPool (poolIdx: BigNumberish, price:number | BigNumber): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        return abiCoder.encode(["uint8", "address", "address", "uint256", "uint128"],
                [71, (await this.base).address, (await this.quote).address, poolIdx, this.toCrocPrice(price)])
    }

    toCrocPrice (price: number | BigNumber): BigNumber {
        return typeof(price) === "number" ? toSqrtPrice(price) : price
    }

    async initPermitPool (feeRate: number, protoTake: number, tickSize: number,
        price: number) {
        let permitAddr = BigNumber.from((await this.permit).address).shl(96)
        this.poolIdx = permitAddr.add(this.poolIdx)

        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "uint256", "uint16", "uint16", "uint8", "uint8", "uint8"],
            [110, this.poolIdx, feeRate, tickSize, 0, this.knockoutBits, 1])
        await (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.COLD_PROXY, cmd, false)

        await (await this.dex)
            .connect(await this.trader)
            .userCmd(this.COLD_PROXY, await this.encodeInitPool(this.poolIdx, price), this.overrides)
    }

    async testSetInitLiq (initLiq: number) {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "uint128"], [112, initLiq])
        await (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.COLD_PROXY, cmd, false)
    }    

    async encodeSwap (isBuy: boolean, inBase: boolean, qty: BigNumber, limitLow: BigNumber, limitHigh: BigNumber,
        useSurplus: number): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const tip = 0
        return abiCoder.encode(
            [ "address", "address", "uint256", "bool",    "bool",   "uint128", "uint24", "uint128", "uint128", "uint8"], 
            [ base,      quote,     this.poolIdx, isBuy,     inBase,    qty,      tip,      limitLow, limitHigh, useSurplus]);
    }

    async encodeMintPath (lower: number, upper: number, liq: number, limitLow: BigNumber, limitHigh: BigNumber,
        useSurplus: number): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = this.lpCallCode(1, 11, 12);
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint256", "int24", "int24", "uint128", "uint128", "uint128", "uint8", "address" ], 
            [ callCode, base, quote, this.poolIdx, lower, upper, liq, limitLow, limitHigh, useSurplus, this.lpConduit  ]);
    }

    async encodeBurnPath (lower: number, upper: number, liq: number, limitLow: BigNumber, limitHigh: BigNumber,
        useSurplus: number): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = this.lpCallCode(2, 21, 22);
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint256", "int24", "int24", "uint128", "uint128", "uint128", "uint8", "address" ], 
            [ callCode, base, quote, this.poolIdx, lower, upper, liq, limitLow, limitHigh, useSurplus, this.lpConduit  ]);
    }

    async encodeHarvest(lower: number, upper: number, limitLow: BigNumber, limitHigh: BigNumber,
        useSurplus: number): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = 5
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint256", "int24", "int24", "uint128", "uint128", "uint128", "uint8", "address" ], 
            [ callCode, base, quote, this.poolIdx, lower, upper, 0, limitLow, limitHigh, useSurplus, this.lpConduit  ]);
    }

    async encodeMintAmbientPath (liq: number,  limitLow: BigNumber, limitHigh: BigNumber,
        useSurplus: number): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = this.lpCallCode(3, 31, 32);
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint256", "int24", "int24", "uint128", "uint128", "uint128", "uint8", "address" ], 
            [ callCode, base, quote, this.poolIdx, 0, 0, liq, limitLow, limitHigh, useSurplus, this.lpConduit  ]);
    }

    async encodeBurnAmbientPath (liq: number,  limitLow: BigNumber, limitHigh: BigNumber, 
        useSurplus: number): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = this.lpCallCode(4, 41, 42);
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint256", "int24", "int24", "uint128", "uint128", "uint128", "uint8", "address"], 
            [ callCode, base, quote, this.poolIdx, 0, 0, liq, limitLow, limitHigh, useSurplus, this.lpConduit ]);
    }

    lpCallCode (liqCode: number, baseCode: number, quoteCode: number): number {
        if (this.liqQty) { 
            return this.liqBase ? 
                baseCode : quoteCode
        } else {
            return liqCode
        }
    }

    async encodeMintKnockout (liq: number, isBid: boolean, bidTick: number, askTick: number, partial: boolean, useSurplus: number): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = 91
        const inner: BytesLike = abiCoder.encode(["uint128", "bool"], [liq, partial])
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint256", "int24", "int24", "bool", "uint8", "bytes"],
            [ callCode, base, quote, this.poolIdx, bidTick, askTick, isBid, useSurplus, inner])
    }

    async encodeBurnKnockout (liq: number, isBid: boolean, bidTick: number, askTick: number, partial: boolean, qtyInLiq: boolean, useSurplus: number): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = 92
        const inner: BytesLike = abiCoder.encode(["uint128", "bool", "bool"], [liq, qtyInLiq, partial])
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint256", "int24", "int24", "bool", "uint8", "bytes"],
            [ callCode, base, quote, this.poolIdx, bidTick, askTick, isBid, useSurplus, inner])
    }

    async encodeClaimKnockout (isBid: boolean, bidTick: number, askTick: number, root: BigNumber, proof: BigNumber[], useSurplus: number): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = 93
        const inner: BytesLike = abiCoder.encode(["uint160", "uint256[]"], [root, proof])
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint256", "int24", "int24", "bool", "uint8", "bytes"],
            [ callCode, base, quote, this.poolIdx, bidTick, askTick, isBid, useSurplus, inner])
    }

    async encodeRecoverKnockout (isBid: boolean, bidTick: number, askTick: number, pivotTime: number, useSurplus: number): Promise<BytesLike> {
        let abiCoder = new ethers.utils.AbiCoder()
        let base = (await this.base).address
        let quote = (await this.quote).address
        const callCode = 94
        const inner: BytesLike = abiCoder.encode(["uint32"], [pivotTime])
        return abiCoder.encode(
            [ "uint8", "address", "address", "uint256", "int24", "int24", "bool", "uint8", "bytes"],
            [ callCode, base, quote, this.poolIdx, bidTick, askTick, isBid, useSurplus, inner])
    }

    async testMint (lower: number, upper: number, liq: number, useSurplus?: number): Promise<ContractTransaction> {
        return this.testMintFrom(await this.trader, lower, upper, liq, useSurplus)
    }

    async testMintAmbient (liq: number, useSurplus?: number): Promise<ContractTransaction> {
        return this.testMintAmbientFrom(await this.trader, liq, useSurplus)
    }

    async testMintOther (lower: number, upper: number, liq: number, useSurplus?: number): Promise<ContractTransaction> {
        return this.testMintFrom(await this.other, lower, upper, liq, useSurplus)
    }

    async testBurn (lower: number, upper: number, liq: number, useSurplus?: number): Promise<ContractTransaction> {
        return this.testBurnFrom(await this.trader, lower, upper, liq, useSurplus)
    }

    async testHarvest (lower: number, upper: number, useSurplus?: number): Promise<ContractTransaction> {
        return this.testHarvestFrom(await this.trader, lower, upper, useSurplus)
    }

    async testBurnAmbient (liq: number, useSurplus?: number): Promise<ContractTransaction> {
        return this.testBurnAmbientFrom(await this.trader, liq, useSurplus)
    }

    async testBurnOther (lower: number, upper: number, liq: number): Promise<ContractTransaction> {
        return this.testBurnFrom(await this.other, lower, upper, liq)
    }

    async testSwap (isBuy: boolean, inBaseQty: boolean, qty: number, price: BigNumber): 
        Promise<ContractTransaction> {
        return this.testSwapFrom(await this.trader, isBuy, inBaseQty, qty, price)
    }

    async testSwapSurplus (isBuy: boolean, inBaseQty: boolean, qty: number, price: BigNumber, 
        surplusFlag: number = 1 + 2): Promise<ContractTransaction> {
        return this.testSwapFrom(await this.trader, isBuy, inBaseQty, qty, price, surplusFlag)
    }

    async testSwapOther (isBuy: boolean, inBaseQty: boolean, qty: number, price: BigNumber): 
        Promise<ContractTransaction> {
        return this.testSwapFrom(await this.other, isBuy, inBaseQty, qty, price)
    }

    readonly BOOT_PROXY: number = 0;
    readonly HOT_PROXY: number = 1;
    readonly WARM_PROXY: number = 2;
    readonly COLD_PROXY: number = 3;
    readonly LONG_PROXY: number = 4;
    readonly MULTI_PROXY: number = 6;
    readonly KNOCKOUT_PROXY: number = 7;
    readonly EMERGENCY_PROXY: number = 9999

    async testMintFrom (from: Signer, lower: number, upper: number, liq: number, useSurplus: number = 0): Promise<ContractTransaction> {
        await this.snapStart()
        if (this.useHotPath) {
            let inputBytes = this.encodeMintPath(lower, upper, liq*1024, toSqrtPrice(0.000001), toSqrtPrice(100000000000.0), useSurplus)
            return (await this.dex).connect(from).userCmd(this.WARM_PROXY, await inputBytes, this.overrides)
        } else {
            let directive = singleHop((await this.base).address,
            (await this.quote).address, simpleMint(this.poolIdx, lower, upper, liq*1024))
            let inputBytes = encodeOrderDirective(directive);
            return (await this.dex).connect(from).userCmd(this.LONG_PROXY, inputBytes, this.overrides)
        }
    }

    async testBurnFrom (from: Signer, lower: number, upper: number, liq: number, useSurplus: number = 0): Promise<ContractTransaction> {
        await this.snapStart()
        if (this.useHotPath) {
            let inputBytes = this.encodeBurnPath(lower, upper, liq*1024, toSqrtPrice(0.000001), toSqrtPrice(100000000000.0), useSurplus)
            return (await this.dex).connect(from).userCmd(this.WARM_PROXY, await inputBytes, this.overrides)
        } else {
            let directive = singleHop((await this.base).address,
            (await this.quote).address, simpleMint(this.poolIdx, lower, upper, -liq*1024))
            let inputBytes = encodeOrderDirective(directive);
            return (await this.dex).connect(from).userCmd(this.LONG_PROXY, inputBytes, this.overrides)
        }
    }

    async testHarvestFrom (from: Signer, lower: number, upper: number, useSurplus: number = 0): Promise<ContractTransaction> {
        await this.snapStart()
        let inputBytes = this.encodeHarvest(lower, upper, toSqrtPrice(0.000001), toSqrtPrice(100000000000.0), useSurplus)
        return (await this.dex).connect(from).userCmd(this.WARM_PROXY, await inputBytes, this.overrides)
    }

    async testBurnAmbientFrom (from: Signer, liq: number, useSurplus: number = 0): Promise<ContractTransaction> {
        await this.snapStart()
        if (this.useHotPath) {
            let inputBytes = this.encodeBurnAmbientPath(liq*1024, toSqrtPrice(0.000001), toSqrtPrice(100000000000.0), useSurplus)
            return (await this.dex).connect(from).userCmd(this.WARM_PROXY, await inputBytes, this.overrides)
        } else {
            let directive = singleHop((await this.base).address,
            (await this.quote).address, simpleMintAmbient(this.poolIdx, -liq*1024))
            let inputBytes = encodeOrderDirective(directive);
            return (await this.dex).connect(from).userCmd(this.LONG_PROXY, inputBytes, this.overrides)
        }
    }

    async testMintAmbientIdx (liq: number, poolIdx: number): Promise<ContractTransaction> {
        await this.snapStart()
        let directive = singleHop((await this.base).address,
        (await this.quote).address, simpleMintAmbient(this.poolIdx, liq*1024))
        directive.hops[0].pools[0].poolIdx = poolIdx
        let inputBytes = encodeOrderDirective(directive);
        return (await this.dex).connect(await this.trader).userCmd(this.LONG_PROXY, inputBytes, this.overrides)
    }

    async testMintAmbientFrom (from: Signer, liq: number, useSurplus: number = 0): Promise<ContractTransaction> {
        await this.snapStart()
        if (this.useHotPath) {
            let inputBytes = this.encodeMintAmbientPath(liq*1024, toSqrtPrice(0.000001), toSqrtPrice(100000000000.0), useSurplus)
            return (await this.dex).connect(from).userCmd(this.WARM_PROXY, await inputBytes, this.overrides)
        } else {
            let directive = singleHop((await this.base).address,
            (await this.quote).address, simpleMintAmbient(this.poolIdx, liq*1024))
            let inputBytes = encodeOrderDirective(directive);
            return (await this.dex).connect(from).userCmd(this.LONG_PROXY, inputBytes, this.overrides)
        }
    }

    async testKnockoutMint (qty: number, isBid: boolean, bidTick: number, askTick: number, partial: boolean, useSurplus: number = 0): Promise<ContractTransaction> {
        await this.snapStart()
        let inputBytes = this.encodeMintKnockout(qty, isBid, bidTick, askTick, partial, useSurplus)
        return (await this.dex).connect(await this.trader).userCmd(this.KNOCKOUT_PROXY, await inputBytes, this.overrides)
    }

    async testKnockoutBurn (qty: number, isBid: boolean, bidTick: number, askTick: number, partial: boolean, useSurplus: number = 0): Promise<ContractTransaction> {
        await this.snapStart()
        let inputBytes = this.encodeBurnKnockout(qty, isBid, bidTick, askTick, partial, false, useSurplus)
        return (await this.dex).connect(await this.trader).userCmd(this.KNOCKOUT_PROXY, await inputBytes, this.overrides)
    }

    async testKnockoutBurnLiq (qty: number, isBid: boolean, bidTick: number, askTick: number, partial: boolean, useSurplus: number = 0): Promise<ContractTransaction> {
        await this.snapStart()
        let inputBytes = this.encodeBurnKnockout(qty, isBid, bidTick, askTick, partial, true, useSurplus)
        return (await this.dex).connect(await this.trader).userCmd(this.KNOCKOUT_PROXY, await inputBytes, this.overrides)
    }

    async testKnockoutClaim (isBid: boolean, bidTick: number, askTick: number, root: BigNumber, proof: BigNumber[], useSurplus: number = 0): Promise<ContractTransaction> {
        await this.snapStart()
        let inputBytes = this.encodeClaimKnockout(isBid, bidTick, askTick, root, proof, useSurplus)
        return (await this.dex).connect(await this.trader).userCmd(this.KNOCKOUT_PROXY, await inputBytes, this.overrides)
    }

    async testKnockoutRecover (isBid: boolean, bidTick: number, askTick: number, pivot: number, useSurplus: number = 0): Promise<ContractTransaction> {
        await this.snapStart()
        let inputBytes = this.encodeRecoverKnockout(isBid, bidTick, askTick, pivot, useSurplus)
        return (await this.dex).connect(await this.trader).userCmd(this.KNOCKOUT_PROXY, await inputBytes, this.overrides)
    }

    async testSwapFrom (from: Signer, isBuy: boolean, inBaseQty: boolean, qty: number, price: BigNumber,
        useSurplus: number = 0): Promise<ContractTransaction> {
        const slippage = inBaseQty == isBuy ? BigNumber.from(0) : BigNumber.from(2).pow(126)
        await this.snapStart()
        if (this.useSwapProxy.base) {
            let encoded = await this.encodeSwap(isBuy, inBaseQty, BigNumber.from(qty), price, slippage, useSurplus)
            return (await this.dex).connect(from).userCmd(this.HOT_PROXY, encoded, this.overrides)
        } else if (this.useHotPath) {
            return (await this.dex).connect(from).swap((await this.base).address, (await this.quote).address, 
                this.poolIdx, isBuy, inBaseQty, qty, 0, price, slippage, useSurplus, this.overrides)
        } else {
            let directive = singleHop((await this.base).address,
                (await this.quote).address, simpleSwap(this.poolIdx, isBuy, inBaseQty, Math.abs(qty), price))
            let inputBytes = encodeOrderDirective(directive);
            return (await this.dex).connect(from).userCmd(this.LONG_PROXY, inputBytes, this.overrides)
        }
    }

    async testOrder (order: OrderDirective, noOverrides?: boolean): Promise<ContractTransaction> {
        let override = noOverrides ? {} : this.overrides
        await this.snapStart();
        return (await this.dex).connect(await this.trader)
            .userCmd(this.LONG_PROXY, encodeOrderDirective(order), override)
    }

    async testRevisePool (feeRate: number, protoTake: number, tickSize:number, jit: number = 0, knockoutFlags: number = 0): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()

        if (protoTake > 0) {
            await this.setProtocolTake(protoTake)
            let takeCmd = abiCoder.encode(["uint8", "address", "address", "uint256"],
                [115, (await this.base).address, (await this.quote).address, this.poolIdx]);
            (await this.dex).connect(await this.auth).protocolCmd(this.COLD_PROXY, takeCmd, false)              
        }

        let cmd = abiCoder.encode(["uint8", "address", "address", "uint256", "uint16", "uint16", "uint8", "uint8"],
            [111, (await this.base).address, (await this.quote).address, this.poolIdx, feeRate, tickSize, jit, knockoutFlags])

        return (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.COLD_PROXY, cmd, false)
    }

    async setProtocolTake (protoTake: number) {
        let abiCoder = new ethers.utils.AbiCoder()
        let takeCmd = abiCoder.encode(["uint8", "uint8"], [114, protoTake]);
        await (await this.dex).connect(await this.auth).protocolCmd(this.COLD_PROXY, takeCmd, false)
    }

    async testRevisePoolIdx (idx: number, feeRate: number, protoTake: number, tickSize:number, jit: number = 0): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()

        if (protoTake > 0) {
            let takeCmd = abiCoder.encode(["uint8", "uint8"], [114, protoTake]);
            (await this.dex).connect(await this.auth).protocolCmd(this.COLD_PROXY, takeCmd, false)

            takeCmd = abiCoder.encode(["uint8", "address", "address", "uint256"],
                [115, (await this.base).address, (await this.quote).address, idx]);
            (await this.dex).connect(await this.auth).protocolCmd(this.COLD_PROXY, takeCmd, false)              
        }

        let cmd = abiCoder.encode(["uint8", "address", "address", "uint256", "uint16", "uint16", "uint8", "uint8"],
            [111, (await this.base).address, (await this.quote).address, idx, feeRate, tickSize, jit, 0])
        return (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.COLD_PROXY, cmd, false)
    }

    async testPegPriceImprove (collateral: number, awayTick: number): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "address", "uint128", "uint16"],
            [113, (await this.base).address, collateral, awayTick])
        return (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.COLD_PROXY, cmd, false)
    }

    async testPegPriceImproveQuote (collateral: number, awayTick: number): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "address", "uint128", "uint16"],
            [113, (await this.quote).address, collateral, awayTick])
        return (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.COLD_PROXY, cmd, false)
    }

    async testUpgrade (slot: number, address: string): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "address", "uint16"], [21, address, slot])
        return (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.BOOT_PROXY, cmd, true)
    }

    async testUpgradeHotProxy (address: string, disableEmbedded: boolean = true): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "bool"], [22, !disableEmbedded])
        await (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.COLD_PROXY, cmd, true)

        cmd = abiCoder.encode(["uint8", "address", "uint16"], [21, address, 1])
        return (await this.dex)
            .connect(await this.auth)
            .protocolCmd(this.BOOT_PROXY, cmd, true)
    }


    async testDeposit (from: Signer, recv: string, value: number | BigNumber, token: string,
        overrides?: PayableOverrides): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "address", "uint128", "address"],
                    [73, recv, value, token])
        return (await this.dex).connect(from).userCmd(this.COLD_PROXY, cmd, 
            overrides ? overrides : this.overrides)
    }

    async testDepositPermit (from: Signer, recv: string, value: number | BigNumber, token: string,
        deadline: number, v: number, r: number, s: number, overrides?: PayableOverrides): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "address", "uint128", "address", "uint256", "uint8", "uint256", "uint256"],
                    [83, recv, value, token, deadline, v, r, s])
        return (await this.dex).connect(from).userCmd(this.COLD_PROXY, cmd, 
            overrides ? overrides : this.overrides)
    }

    async testDisburse (from: Signer, recv: string, value: number | BigNumber, token: string,
        overrides?: PayableOverrides): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "address", "int128", "address"],
                    [74, recv, value, token])
        return (await this.dex).connect(from).userCmd(this.COLD_PROXY, cmd, 
            overrides ? overrides : this.overrides)
    }

    async testTransfer (from: Signer, recv: string, value: number | BigNumber, token: string,
        overrides?: PayableOverrides): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "address", "int128", "address"],
                    [75, recv, value, token])
        return (await this.dex).connect(from).userCmd(this.COLD_PROXY, cmd, 
            overrides ? overrides : this.overrides)
    }

    async testSidePocket (from: Signer, fromSalt: number, toSalt: number, value: number | BigNumber, token: string,
        overrides?: PayableOverrides): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "uint256", "uint256", "int128", "address"],
                    [76, fromSalt, toSalt, value, token])
        return (await this.dex).connect(from).userCmd(this.COLD_PROXY, cmd, 
            overrides ? overrides : this.overrides)
    }

    async testDepositVirt (from: Signer, tracker: string, salt: number, value: number | BigNumber, args: string,
        overrides?: PayableOverrides): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "address", "uint256", "int128", "bytes"],
                    [77, tracker, salt, value, args])
        return (await this.dex).connect(from).userCmd(this.COLD_PROXY, cmd, 
            overrides ? overrides : this.overrides)
    }

    async testWithdrawVirt (from: Signer, tracker: string, salt: number, value: number | BigNumber, args: string,
        overrides?: PayableOverrides): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "address", "uint256", "int128", "bytes"],
                    [78, tracker, salt, value, args])
        return (await this.dex).connect(from).userCmd(this.COLD_PROXY, cmd, 
            overrides ? overrides : this.overrides)
    }
    
    async testCollectSurplus (from: Signer, recv: string, value: number | BigNumber, token: string, isTransfer: boolean,
        overrides?: PayableOverrides): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd
        if (isTransfer) {
            cmd = abiCoder.encode(["uint8", "address", "uint128", "address"],
                    [75, recv, value, token])
        } else if (BigNumber.from(value).lt(0)) {
            cmd = abiCoder.encode(["uint8", "address", "uint128", "address"],
                    [73, recv, -value, token])
        } else {
            cmd = abiCoder.encode(["uint8", "address", "uint128", "address"],
                    [74, recv, value, token])
        }
        return (await this.dex).connect(from).userCmd(this.COLD_PROXY, cmd, 
            overrides ? overrides : this.overrides)
    }

    async testApproveRouter (from: Signer, router: string, nCalls: number, callpaths: number[]): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        const cmd = abiCoder.encode(["uint8", "address", "uint32", "uint16[]"],
                [72, router, nCalls, callpaths])
        return (await this.dex).connect(from).userCmd(this.COLD_PROXY, cmd, this.overrides)
    }

    async testApproveRouterCond (from: Signer, router: string, nCalls: number, callpaths: number[]): Promise<ContractTransaction> {
        let abiCoder = new ethers.utils.AbiCoder()
        const cmd = abiCoder.encode(["uint8", "address", "uint32", "uint16[]"],
                [72, router, nCalls, callpaths])
        return (await this.dex).connect(from).userCmd(this.COLD_PROXY, cmd, this.overrides)
    }

    async testMintAgent (from: Signer, client: string, val: number,
        overrides?: PayableOverrides): Promise<ContractTransaction> {
        let cmd = this.encodeMintAmbientPath(val, toSqrtPrice(0.01), toSqrtPrice(1000), 0)
        return (await this.dex).connect(from).userCmdRouter(this.WARM_PROXY, await cmd, client,
            overrides ? overrides : this.overrides)
    }

    async collectSurplus (recv: string, base: number | BigNumber, quote: number | BigNumber) {
        await this.testCollectSurplus(await this.trader, recv, base, (await this.base).address, false)
        await this.testCollectSurplus(await this.trader, recv, quote, (await this.quote).address, false)
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

    async liquidity (subInitLocked: boolean = true): Promise<BigNumber> {
        return this.liquidityIdx(this.poolIdx, subInitLocked)
    }

    async liquidityIdx (idx: BigNumberish, subInitLocked: boolean = true): Promise<BigNumber> {
        const INIT_LIQ = 1; // Default burnt liquidity on every pool
        let liq = (await this.query).queryLiquidity
            ((await this.base).address, (await this.quote).address, idx)

        if (subInitLocked) {
            return (await liq).sub(INIT_LIQ);
        } else {
            return liq;
        }
    }

    async price(): Promise<BigNumber> {
        return (await (await this.query).queryCurve
            ((await this.base).address, (await this.quote).address, this.poolIdx))
            .priceRoot_
    }

    async priceIdx (idx: number): Promise<BigNumber> {
        return (await (await this.query).queryCurve
            ((await this.base).address, (await this.quote).address, idx))
            .priceRoot_
    }

    async traderBalance (token: Promise<MockERC20>): Promise<BigNumber> {
        let addr = (await (await this.trader).getAddress())
        return (await token).balanceOf(addr)
    }

    async prototypeOrder(nPools: number = 1): Promise<OrderDirective> {
        let pools: PoolDirective[] = []
        for (let i = 0; i < nPools; ++i) {
            pools.push(simpleMintAmbient(this.poolIdx, 0))
        }
        return singleHopPools((await this.base).address,
            (await this.quote).address, pools)
    }

    async prototypeOrderSide (openSide: string): Promise<OrderDirective> {
        let order = await this.prototypeOrder()
        if (order.open.token !== openSide) {
            order.open.token = (await this.quote).address
            order.hops[0].settlement.token = (await this.quote).address
        }
        return order
    }

}

export function sortBaseToken (tokenX: Token, tokenY: Token): Token {
    return addrLessThan(tokenX.address, tokenY.address) ?
        tokenX : tokenY;
}

export function sortQuoteToken (tokenX: Token, tokenY: Token): Token {
    return addrLessThan(tokenX.address, tokenY.address) ?
        tokenY : tokenX;
}

export function addrLessThan (addrX: string, addrY: string): boolean {
    return addrX.toLowerCase().localeCompare(addrY.toLowerCase()) < 0
}
