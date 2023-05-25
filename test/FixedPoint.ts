import { BigNumber } from 'ethers';

const PRECISION = 100000000
export const Q_64 = BigNumber.from(2).pow(64);
export const Q_48 = BigNumber.from(2).pow(48);

export const MIN_TICK = -665454
export const MAX_TICK = 831818

export const MAX_PRICE = BigNumber.from("21267430153580247136652501917186561137")
export const MIN_PRICE = BigNumber.from("65538")

export const ZERO_ADDR = "0x0000000000000000000000000000000000000000"

export function toQ64 (val: number): BigNumber {
    let multFixed = Math.round(val * PRECISION);
    return BigNumber.from(multFixed).mul(Q_64).div(PRECISION)
}

export function toQ48 (val: number): BigNumber {
    let multFixed = Math.round(val * PRECISION);
    return BigNumber.from(multFixed).mul(Q_48).div(PRECISION)
}

export function fromQ64 (val: BigNumber): number {
    return val.mul(PRECISION).div(Q_64).toNumber() / PRECISION;
}

export function fromQ48 (val: BigNumber): number {
    return val.mul(PRECISION).div(Q_48).toNumber() / PRECISION;
}

export function toFixedGrowth (mult: number) {
    let multFixed = Math.round(mult * PRECISION);
    return BigNumber.from(multFixed).mul(Q_48).div(PRECISION)
}

export function fromFixedGrowth (val: BigNumber) {
    return val.mul(PRECISION).div(Q_48).toNumber() / PRECISION;
}

export function toSqrtPrice (price: number) {
     let sqrtFixed = Math.round(Math.sqrt(price) * PRECISION);
     return BigNumber.from(sqrtFixed).mul(Q_64).div(PRECISION)
}

export function fromSqrtPrice (val: BigNumber) {
    let root = val.mul(PRECISION).div(Q_64).toNumber() / PRECISION;
    return root * root;
}

export function maxSqrtPrice(): BigNumber {
    return BigNumber.from("21267430153580247136652501917186561138").sub(1)
}

export function minSqrtPrice(): BigNumber {
    return BigNumber.from("65538")
}
