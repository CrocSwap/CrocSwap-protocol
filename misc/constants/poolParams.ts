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

const mainnetParams: CrocPoolParams = {
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

const l2TestnetParams: CrocPoolParams = {
    universal: {
        initLiq: 10000
    },
    stdPoolIdx: 36000,
    stdPoolParams: {
        jitThresh: 10,
        tickSize: 1,
        feeBps: 15,
        knockoutOn: true
    }
}

const goerliDryRunParams = mainnetParams

export const CROC_POOL_PARAMS = {
    '0x1': mainnetParams,
    '0x5': goerliDryRunParams,
    '0x8274f': l2TestnetParams,
}
