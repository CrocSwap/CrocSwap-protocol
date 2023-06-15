import { AbiCoder } from "@ethersproject/abi";
import { COLD_PROXY_IDX } from "../constants/addrs";
import { CrocPoolParams } from "../constants/poolParams";
import { CrocProtocolCmd } from "./governance";

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