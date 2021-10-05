import { BigNumber, BytesLike, ethers } from 'ethers';
import { OrderDirective, PassiveDirective, SwapDirective, PoolDirective, ConcentratedBookend, ConcentratedDirective, SettlementDirective, HopDirective, encodeOrderDirective } from './EncodeOrder';

export function singleHop (open: string, close: string, pool: PoolDirective): OrderDirective {
    return {
        open: simpleSettle(open),
        hops: [ { settlement: simpleSettle(close), pools: [pool]}]
    }
}

export function simpleSettle (token: string): SettlementDirective {
    return { token: token, limitQty: BigNumber.from("100000000000000000"),
        dustThresh: BigNumber.from(0), useReserves: false }
}

export function simpleMint (poolIdx: number, lowerTick: number, upperTick: number, liq: number): PoolDirective  {
     return { 
        poolIdx: poolIdx,
        passive: {
            ambient: { liquidity: BigNumber.from(0) },
            concentrated: [{ openTick: lowerTick,
                bookends: [{ closeTick: upperTick, liquidity: BigNumber.from(liq)}]
            }]
        },
        passivePost: {
            ambient: { liquidity: BigNumber.from(0) },
            concentrated: [{ openTick: 0,
                bookends: [] }]
        },
        swap: {
            liqMask: 0,
            isBuy: false,
            quoteToBase: false,
            qty: BigNumber.from(0),
            limitPrice: BigNumber.from(0)
        }
    }
}
