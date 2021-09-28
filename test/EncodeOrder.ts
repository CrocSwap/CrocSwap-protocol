import { BigNumber, BytesLike, ethers } from 'ethers';

export function encodeOrderDirective (directive: OrderDirective): BytesLike {
    let open = encodeSettlement(directive.openSettle)
    let close = encodeSettlement(directive.closeSettle)
    let hops = listEncoding(directive.hops, encodeHop)
    return ethers.utils.concat([open, hops, close])
}


function encodeSettlement (dir: SettlementDirective): BytesLike {
    let limit = encodeFull(dir.limitQty)
    let dust = encodeFull(dir.dustThresh)
    let reserveFlag = encodeByte(dir.useReserves ? 1 : 0)
    return ethers.utils.concat([limit, dust, reserveFlag])
}

function encodeHop (hop: HopDirective): BytesLike {
    let tokenX = ethers.utils.hexlify(hop.pair.tokenX)
    let tokenY = ethers.utils.hexlify(hop.pair.tokenY)
    let settle = encodeSettlement(hop.settlement)
    let pools = listEncoding(hop.pair.pools, encodePool)
    return ethers.utils.concat([tokenX, tokenY, pools, settle])
}

function encodePool (pool: PoolDirective): BytesLike {
    let poolIdx = encodeJsNum(pool.poolIdx, 3)
    let passive = encodePassive(pool.passive)
    let swap = encodeSwap(pool.swap)
    let post = encodePassive(pool.passivePost)
    return ethers.utils.concat([poolIdx, passive, swap, post])
}

function encodeSwap (swap: SwapDirective): BytesLike {
    let liqMask = encodeByte(swap.liqMask)
    let dirFlags = encodeByte((swap.isBuy ? 2 : 0) + (swap.quoteToBase ? 1 : 0))
    let qty = encodeFull(swap.qty)
    let limit = encodeFull(swap.limitPrice)
    return ethers.utils.concat([liqMask, dirFlags, qty, limit])
}

function encodePassive (passive: PassiveDirective): BytesLike {
    let amb = encodeFull(passive.ambient.liquidity)
    let conc = listEncoding(passive.concentrated, encodeConc)
    return ethers.utils.concat([amb, conc])
}

function encodeConc (conc: ConcentratedDirective): BytesLike {
    let openTick = encodeJsNum(conc.openTick, 3)
    let bookends = listEncoding(conc.bookends, encodeBookend)
    return ethers.utils.concat([openTick, bookends])
}

function encodeBookend (bookend: ConcentratedBookend): BytesLike {
    let closeTick = encodeJsNum(bookend.closeTick, 3)
    let liq = encodeFull(bookend.liquidity)
    return ethers.utils.concat([closeTick, liq])
}

function listEncoding<T> (elems: T[], encoderFn: (x: T) => BytesLike): BytesLike {
    let count = encodeByte(elems.length)
    let vals = elems.map(encoderFn)
    return ethers.utils.concat([count].concat(vals))
}

function encodeFull (val: BigNumber): BytesLike {
    return encodeNum(val, 32)
}

function encodeJsNum (val: number, nBytes: number): BytesLike {
    return encodeNum(BigNumber.from(val), nBytes)
}

function encodeNum (val: BigNumber, nBytes: number): BytesLike {
    let hex = ethers.utils.hexValue(val)
    let nZeros = nBytes - hex.length
    if (nZeros < 0) {
        throw new RangeError(`${nBytes} Byte encoding out-of-bounds: ${val}`)
    }
    return ethers.utils.hexZeroPad(hex, nZeros)
}

function encodeByte (val: number): BytesLike {
    if (val < 0 || val >= 256) {
        throw new RangeError(`Single byte encode out-of-bounds: ${val}`)
    }
    return ethers.utils.hexValue(val)
}

interface OrderDirective {
    openSettle: SettlementDirective
    hops: HopDirective[]
    closeSettle: SettlementDirective
}

interface SettlementDirective {
    limitQty: BigNumber,
    dustThresh: BigNumber,
    useReserves: boolean
}

interface HopDirective {
    pair: PairDirective,
    settlement: SettlementDirective
}

interface PairDirective {
    tokenX: string,
    tokenY: string,
    pools: PoolDirective[]
}

interface PoolDirective {
    poolIdx: number
    passive: PassiveDirective,
    swap: SwapDirective,
    passivePost: PassiveDirective
}

interface SwapDirective {
    liqMask: number
    isBuy: boolean,
    quoteToBase: boolean,
    qty: BigNumber
    limitPrice: BigNumber
}

interface PassiveDirective {
    ambient: AmbientDirective
    concentrated: ConcentratedDirective[]
}

interface AmbientDirective {
    liquidity: BigNumber
}

interface ConcentratedDirective {
    openTick: number,
    bookends: ConcentratedBookend[]
}

interface ConcentratedBookend {
    closeTick: number,
    liquidity: BigNumber
}
