import { BigNumberish } from "ethers"
import { ethers } from "hardhat"

export interface CrocOnePoolParams {
    jitThresh: number,
    tickSize: number
    feeBps: number,
    knockoutOn: boolean
}

export interface CrocCrossPoolParams {
    initLiq: BigNumberish
}

export interface CrocPoolParams {
    universal: CrocCrossPoolParams
    stdPoolIdx: number
    stdPoolParams: CrocOnePoolParams
}

const goerliParams: CrocPoolParams = {
    universal: {
        initLiq: 10000
    },
    stdPoolIdx: 420,
    stdPoolParams: {
        jitThresh: 30,
        tickSize: 16,
        feeBps: 27,
        knockoutOn: true
    }
}

export const CROC_POOL_PARAMS = {
    '0x5': goerliParams,
}
