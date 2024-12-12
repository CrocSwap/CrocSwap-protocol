import { OrderDirectiveObj } from "./EncodeOrder"
import { Token } from "./FacadePool"
import { ZERO_ADDR } from "./FixedPoint"


export interface SwapHop {
    token: Token,
    poolIdx: number,
}

export interface SwapPath {
    hops: SwapHop[],
    qty: BigNumber,
    isFixedOutput: boolean,
    limitQtyOverride?: BigNumber,
}

export function formatDirective(paths: SwapPath[]): OrderDirectiveObj {
    const order = new OrderDirectiveObj(ZERO_ADDR)
    let prevSettlement = order.open
    for (let p = 0; p < paths.length; p++) {
        const path = paths[p]
        let hops = path.hops.slice()
        if (path.isFixedOutput) {
            hops = hops.reverse()
        }
        prevSettlement.token = hops[0].token.address

        let prevToken = hops[0].token
        for (let h = 1; h < hops.length; h++) {
            const hopDir = order.appendHop(hops[h].token.address)
            // If last hop, set surplus flag for input/output and limitQty to act as minOut or maxIn
            if (h == hops.length - 1 ) {
                if (path.limitQtyOverride != undefined) {
                    hopDir.settlement.limitQty = path.limitQtyOverride
                }
            } else {
                // Intermediate hops should always use surplus
                hopDir.settlement.useSurplus = true
            }
            const poolDir = order.appendPool(hops[h].poolIdx)

            if (h == 1) {
                poolDir.swap.qty = path.qty;
            } else {
                // Enable fractional roll to use 100% of the previous hop as qty
                poolDir.swap.rollType = 4
                poolDir.swap.qty = BigNumber.from(10000)
            }

            poolDir.swap.isBuy = Boolean((prevToken.address.toLowerCase() < hops[h].token.address.toLowerCase()) !== path.isFixedOutput)
            poolDir.swap.inBaseQty = Boolean(prevToken.address.toLowerCase() < hops[h].token.address.toLowerCase())
            poolDir.swap.limitPrice = poolDir.swap.isBuy ? BigNumber.from("21267430153580247136652501917186561137") : BigNumber.from("65538")
            prevToken = hops[h].token
        }

        // If there is more than one path, open new hop to start the next path
        if (p < paths.length - 1) {
            const hop_switch = order.appendHop(ZERO_ADDR)
            prevSettlement = hop_switch.settlement
        }
    }

    return order
}

import { BigNumber, BigNumberish, BytesLike, ethers } from 'ethers';

