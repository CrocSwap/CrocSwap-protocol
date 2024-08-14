import { AbiCoder } from "@ethersproject/abi";
import { COLD_PROXY_IDX } from "../constants/addrs";
import { CrocPoolParams } from "../constants/poolParams";
import { CrocProtocolCmd } from "./governance";
import { BLAST_PROXY_PATH } from "../../test/SetupDex";
import { BigNumber } from "ethers";

export function initLiqCmd (params: CrocPoolParams): CrocProtocolCmd {
    const abi = new AbiCoder()
    let setPoolLiqCmd = abi.encode(["uint8", "uint128"], [112, params.universal.initLiq])
    return {
        protocolCmd: setPoolLiqCmd,
        callpath: COLD_PROXY_IDX,
        sudo: false
    }
}

export function poolStdTemplCmd (params: CrocPoolParams): CrocProtocolCmd {
    const abi = new AbiCoder()

    const feeArgs = params.stdPoolParams.feeBps * 100
    const jitThresh = params.stdPoolParams.jitThresh / 10

    if (jitThresh != Math.floor(jitThresh)) {
        throw new Error("JIT Thresh must be multiple of 10")
    }

    let knockoutFlag = 0
    if (params.stdPoolParams.knockoutOn) {
        const KNOCKOUT_ON_FLAG = 32

        const ticks2Pow = Math.log(params.stdPoolParams.tickSize) / Math.log(2)
        if (ticks2Pow != Math.floor(ticks2Pow) || ticks2Pow > 15) {
            throw new Error("Tick size must be power of 2 and within 2^15");
        }

        knockoutFlag = KNOCKOUT_ON_FLAG + ticks2Pow
    }

    const NO_ORACLE_FLAG = 0;

    const templCmd = abi.encode(
        ["uint8", "uint256", "uint16", "uint16", "uint8", "uint8", "uint8"],
        [110, params.stdPoolIdx, feeArgs, params.stdPoolParams.tickSize, 
            jitThresh, knockoutFlag, NO_ORACLE_FLAG])

    return {
        protocolCmd: templCmd,
        callpath: COLD_PROXY_IDX,
        sudo: false
    }
}

export function blastConfigYieldTestnetCmd() {
    let abiCoder = new AbiCoder()
    return {
        callpath: BLAST_PROXY_PATH,
        userCmd: abiCoder.encode(["uint256"], [182354])
    }
}

export function blastConfigYieldMainnetCmd() {
    let abiCoder = new AbiCoder()
    return {
        callpath: BLAST_PROXY_PATH,
        userCmd: abiCoder.encode(["uint256"], [182354])
    }
}

const BLAST_USDB_TESTNET = '0x4200000000000000000000000000000000000022'
const BLAST_USDB_MAINNET = '0x4300000000000000000000000000000000000003'
const BLAST_YIELD_MAINNET = '0x4300000000000000000000000000000000000002'

export function blastConfigUsdbTestnet() {
    let abiCoder = new AbiCoder()
    return {
        callpath: BLAST_PROXY_PATH,
        userCmd: abiCoder.encode(["uint256", "address"], [182356, BLAST_USDB_TESTNET])
    }
}

export function blastConfigUsdbMainnet() {
    let abiCoder = new AbiCoder()
    return {
        callpath: BLAST_PROXY_PATH,
        userCmd: abiCoder.encode(["uint256", "address"], [182356, BLAST_USDB_MAINNET])
    }
}

// Flips the command code, because the listed ProtocolCmd has mainnet and testnet inverted
export function blastConfigPointsMainnet (pointsOperator: string) {
    let abiCoder = new AbiCoder()
    return {
        callpath: BLAST_PROXY_PATH,
        protocolCmd: abiCoder.encode(["uint256", "address"], [182352, pointsOperator])
    }
}

export function blastConfigPointsTestnet (pointsOperator: string) {
    let abiCoder = new AbiCoder()
    return {
        callpath: BLAST_PROXY_PATH,
        protocolCmd: abiCoder.encode(["uint256", "address"], [182351, pointsOperator])
    }
}

export function blastClaimUSDBMainnet (recv: string, qty: number): CrocProtocolCmd {
    let wei = BigNumber.from(qty).mul(BigNumber.from(10).pow(18))
    let abiCoder = new AbiCoder()
    return {
        callpath: BLAST_PROXY_PATH,
        protocolCmd: abiCoder.encode(["uint256", "address", "address", "uint256"], 
        [177, recv, BLAST_USDB_MAINNET, wei])
    }
}

export function blastClaimGasMainnet (recv: string, qtyEth: number): CrocProtocolCmd {
    let weiToClaim = BigNumber.from(qtyEth).mul(BigNumber.from(10).pow(18))
    let abiCoder = new AbiCoder()

    const CEIL_GAS_SECS = BigNumber.from(2592000 * 1.5)
    let gasSeconds = weiToClaim.mul(CEIL_GAS_SECS)

    console.log(weiToClaim.toString())
    console.log(gasSeconds.toString())

    return {
        callpath: BLAST_PROXY_PATH,
        protocolCmd: abiCoder.encode(["uint256", "address", "address", "uint256", "uint256", "uint256"], 
        [179, BLAST_YIELD_MAINNET, recv, 0, weiToClaim, gasSeconds])
    }
}
