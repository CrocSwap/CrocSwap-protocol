import { BigNumber, BytesLike, ethers, VoidSigner } from "ethers"
import { CrocPolicy } from "../../contracts/typechain"
import { TimelockAccepts } from "../../typechain"
import { CrocAddrs, CrocGovAddrs } from "../constants/addrs"
import { refContract } from "./chain"

interface TimelockCalls {
    timelockAddr: string
    scheduleCalldata: string, 
    execCalldata: string,
    delay: number
    salt: BytesLike
}

export async function populateTimelockCalls (timelock: TimelockAccepts, target: string, 
    calldata: string, delay: number): Promise<TimelockCalls> {
    const salt = ethers.utils.hexZeroPad(BigNumber.from(Date.now()).toHexString(), 32)

    let sched = await timelock.populateTransaction.schedule(target, 0, calldata as BytesLike, 
        ethers.constants.HashZero, salt, delay)
    let exec = timelock.populateTransaction.execute(target, 0, calldata as BytesLike, 
        ethers.constants.HashZero, salt)

    return {
        timelockAddr: timelock.address,
        scheduleCalldata: (await sched).data as string,
        execCalldata: (await exec).data as string,
        delay: delay,
        salt
    }
}

export interface CrocProtocolCmd {
    callpath: number,
    protocolCmd: BytesLike,
    sudo?: boolean
}

export interface GovernanceResolution {
    resolutionType: "ops" | "treasury"
    protocolCmd: CrocProtocolCmd,
    multisigOrigin: string,
    policyContract: string,
    dexContract: string,
    timelockCall: TimelockCalls
}

export async function opsResolution (addrs: CrocAddrs, cmd: CrocProtocolCmd, 
    delay: number): Promise<GovernanceResolution> {
    const timelock = await refContract("TimelockAccepts", addrs.govern.timelockOps) as TimelockAccepts
    const policy = await refContract("CrocPolicy", addrs.policy) as CrocPolicy

    let policyCall = await policy.populateTransaction.opsResolution(addrs.dex, 
        cmd.callpath, cmd.protocolCmd)
    let timelockCalls = await populateTimelockCalls(timelock, addrs.policy, 
        policyCall.data as string, delay)

    return printResolution({
        resolutionType: "ops",
        protocolCmd: cmd,
        policyContract: addrs.policy,
        dexContract: addrs.dex,
        multisigOrigin: addrs.govern.multisigOps,
        timelockCall: await timelockCalls,
    })
}

export async function treasuryResolution (addrs: CrocAddrs, cmd: CrocProtocolCmd, 
    delay: number): Promise<GovernanceResolution> {
    const timelock = await refContract("TimelockAccepts", addrs.govern.timelockTreasury) as TimelockAccepts
    const policy = await refContract("CrocPolicy", addrs.policy) as CrocPolicy

    let policyCall = await policy.populateTransaction.treasuryResolution(addrs.dex, 
        cmd.callpath, cmd.protocolCmd, cmd.sudo ? cmd.sudo : false)
    let timelockCalls = await populateTimelockCalls(timelock, addrs.policy, 
        policyCall.data as string, delay)

    return printResolution({
        resolutionType: "treasury",
        protocolCmd: cmd,
        policyContract: addrs.policy,
        dexContract: addrs.dex,
        multisigOrigin: addrs.govern.multisigTreasury,
        timelockCall: await timelockCalls,
    })
}

export function printResolution (res: GovernanceResolution): GovernanceResolution {
    console.log("-----")
    console.log("Presenting instructions for governance resolution", res)
    console.log()
    console.log(`Execution instructions for ${res.resolutionType} resolution`)
    console.log()
    console.log(`Will execute a protocolCmd() call on CrocSwapDex contract at ${res.dexContract}`)
    console.log("protocolCmd() will be called with args: ", res.protocolCmd)
    console.log()
    console.log(`Step 1: Use multisig at ${res.multisigOrigin}`)
    console.log(`Sign and send transaction to ${res.timelockCall.timelockAddr}`)
    console.log(`With the following calldata: `)
    console.log(res.timelockCall.scheduleCalldata)
    console.log()
    console.log(`Step 2: Wait at least ${res.timelockCall.delay}`)
    console.log(`Use same multisig at ${res.multisigOrigin}`)
    console.log(`Sign and send transaction to ${res.timelockCall.timelockAddr}`)
    console.log(`With the following calldata: `)
    console.log(res.timelockCall.execCalldata)
    console.log("-----")
    return res
}