import { BigNumber, BytesLike, ethers, BigNumberish } from 'ethers';
import { OrderDirective, PassiveDirective, SwapDirective, PoolDirective,   ConcentratedDirective, SettlementDirective, HopDirective, encodeOrderDirective } from './EncodeOrder';
import { MAX_PRICE, MIN_PRICE } from './FixedPoint';

export function singleHop (open: string, close: string, pool: PoolDirective): OrderDirective {
    return {
        schemaType: 1,
        open: simpleSettle(open),
        hops: [ { settlement: simpleSettle(close), pools: [pool], 
            improve: { isEnabled: false, useBaseSide: false }}]
    }
}

export function doubleHop (open: string, middle: string, close: string, first: PoolDirective, 
    second: PoolDirective): OrderDirective {
    return {
        schemaType: 1,
        open: simpleSettle(open),
        hops: [ { settlement: simpleSettle(middle), pools: [first],
            improve: { isEnabled: false, useBaseSide: false } },
            { settlement: simpleSettle(close), pools: [second], 
            improve: { isEnabled: false, useBaseSide: false }}]
    }
}

export function singleHopPools (open: string, close: string, pools: PoolDirective[]): OrderDirective {
    return {
        schemaType: 1,
        open: simpleSettle(open),
        hops: [ { settlement: simpleSettle(close), pools: pools, 
            improve: { isEnabled: false, useBaseSide: false }}]
    }
}

export function simpleSettle (token: string): SettlementDirective {
    return { token: token, limitQty: BigNumber.from("100000000000000000"),
        dustThresh: BigNumber.from(0), useSurplus: false }
}

export function simpleMint (poolIdx: BigNumberish, lowerTick: number, upperTick: number, liq: number): PoolDirective  {
     return { 
        poolIdx: poolIdx,
        passive: {
            ambient: { isAdd: false, rollType: 0, liquidity: BigNumber.from(0) },
            concentrated: [{ lowTick: lowerTick, highTick: upperTick, isRelTick: false, 
                isAdd: BigNumber.from(liq).gt(0), rollType: 0, liquidity: BigNumber.from(liq).abs()}]
        },
        swap: {
            isBuy: false,
            inBaseQty: false,
            rollType: 0, 
            qty: BigNumber.from(0),
            limitPrice: BigNumber.from(0)
        },
        chain: { rollExit: false, swapDefer: false, offsetSurplus: false}
    }
}

export function simpleMintAmbient (poolIdx: BigNumberish, liq: number): PoolDirective  {
    return { 
       poolIdx: poolIdx,
       passive: {
           ambient: { isAdd: BigNumber.from(liq).gt(0), rollType: 0, liquidity: BigNumber.from(liq).abs() },
           concentrated: [],
       },
       swap: {
           isBuy: false,
           inBaseQty: false,
           rollType: 0,
           qty: BigNumber.from(0),
           limitPrice: BigNumber.from(0)
       },
       chain: { rollExit: false, swapDefer: false, offsetSurplus: false}
   }
}

export function simpleSwap (poolIdx: BigNumberish, isBuy: boolean, inBaseQty: boolean, 
    qty: BigNumberish, limitPrice: BigNumber): PoolDirective  {
    return { 
       poolIdx: poolIdx,
       passive: {
        ambient: { isAdd: false, rollType: 0, liquidity: BigNumber.from(0) },
        concentrated: []
       },
       swap: {
           isBuy: isBuy,
           inBaseQty: inBaseQty,
           rollType: 0,
           qty: BigNumber.from(qty),
           limitPrice: BigNumber.from(limitPrice)
       },
       chain: { rollExit: false, swapDefer: false, offsetSurplus: false}
   }
}

export function twoHopExit (poolIdx: number, baseIn: boolean): PoolDirective {
    return simpleSwap(poolIdx, baseIn, baseIn, 0, baseIn ? MAX_PRICE : MIN_PRICE)
}
