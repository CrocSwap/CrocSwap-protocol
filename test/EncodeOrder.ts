import { BigNumber, BytesLike, ethers } from 'ethers';

export function encodeOrderDirective (directive: OrderDirective): BytesLike {
    let open = encodeSettlement(directive.open)
    let hops = listEncoding(directive.hops, encodeHop)
    return ethers.utils.concat([open, hops])
}

export interface OrderDirective {
    open: SettlementDirective
    hops: HopDirective[]
}

export interface SettlementDirective {
    token: string
    limitQty: BigNumber,
    dustThresh: BigNumber,
    useReserves: boolean
}

export interface HopDirective {
    pools: PoolDirective[]
    settlement: SettlementDirective
}

export interface PoolDirective {
    poolIdx: number
    passive: PassiveDirective,
    swap: SwapDirective,
    passivePost: PassiveDirective
}

export interface SwapDirective {
    liqMask: number
    isBuy: boolean,
    quoteToBase: boolean,
    qty: BigNumber
    limitPrice: BigNumber
}

export interface PassiveDirective {
    ambient: AmbientDirective
    concentrated: ConcentratedDirective[]
}

export interface AmbientDirective {
    liquidity: BigNumber
}

export interface ConcentratedDirective {
    openTick: number,
    bookends: ConcentratedBookend[]
}

export interface ConcentratedBookend {
    closeTick: number,
    liquidity: BigNumber
}


function encodeSettlement (dir: SettlementDirective): BytesLike {
    let token = encodeToken(dir.token)
    let limit = encodeFullSigned(dir.limitQty)
    let dust = encodeFull(dir.dustThresh)
    let reserveFlag = encodeWord(dir.useReserves ? 1 : 0)
    return ethers.utils.concat([token, limit, dust, reserveFlag])
}

function encodeHop (hop: HopDirective): BytesLike {
    let pools = listEncoding(hop.pools, encodePool)
    let settle = encodeSettlement(hop.settlement)
    return ethers.utils.concat([pools, settle])
}

function encodePool (pool: PoolDirective): BytesLike {
    let poolIdx = encodeJsNum(pool.poolIdx, 3)
    let passive = encodePassive(pool.passive)
    let swap = encodeSwap(pool.swap)
    let post = encodePassive(pool.passivePost)
    return ethers.utils.concat([poolIdx, passive, swap, post])
}

function encodeSwap (swap: SwapDirective): BytesLike {
    let liqMask = encodeWord(swap.liqMask)
    let dirFlags = encodeWord((swap.isBuy ? 2 : 0) + (swap.quoteToBase ? 1 : 0))
    let qty = encodeFull(swap.qty)
    let limit = encodeFull(swap.limitPrice)
    return ethers.utils.concat([liqMask, dirFlags, qty, limit])
}

function encodePassive (passive: PassiveDirective): BytesLike {
    let amb = encodeFullSigned(passive.ambient.liquidity)
    let conc = listEncoding(passive.concentrated, encodeConc)
    return ethers.utils.concat([amb, conc])
}

function encodeConc (conc: ConcentratedDirective): BytesLike {
    let openTick = encodeJsSigned(conc.openTick, 3)
    let bookends = listEncoding(conc.bookends, encodeBookend)
    return ethers.utils.concat([openTick, bookends])
}

function encodeBookend (bookend: ConcentratedBookend): BytesLike {
    let closeTick = encodeJsSigned(bookend.closeTick, 3)
    let liq = encodeFullSigned(bookend.liquidity)
    return ethers.utils.concat([closeTick, liq])
}

function listEncoding<T> (elems: T[], encoderFn: (x: T) => BytesLike): BytesLike {
    let count = encodeWord(elems.length)
    let vals = elems.map(encoderFn)
    return ethers.utils.concat([count].concat(vals))
}

function encodeToken (tokenAddr: BytesLike): BytesLike {    
    return ethers.utils.hexZeroPad(tokenAddr, 32)
}

function encodeFull (val: BigNumber): BytesLike {
    return encodeNum(val, 32)
}

function encodeFullSigned (val: BigNumber): BytesLike {
    return encodeSigned(val, 32)
}

function encodeJsNum (val: number, nWords: number): BytesLike {
    return encodeNum(BigNumber.from(val), nWords)
}

function encodeJsSigned (val: number, nWords: number): BytesLike {
    return encodeSigned(BigNumber.from(val), nWords)
}

function encodeSigned (val: BigNumber, nWords: number): BytesLike {
    let sign = encodeWord(val.lt(0) ? 1 : 0)
    let magn = encodeNum(val.abs(), nWords)
    return ethers.utils.concat([sign, magn])
}

function encodeNum (val: BigNumber, nWords: number): BytesLike {
    let hex = ethers.utils.hexValue(val)
    return ethers.utils.hexZeroPad(hex, nWords)
}

function encodeWord (val: number): BytesLike {
    return encodeJsNum(val, 1)
}

