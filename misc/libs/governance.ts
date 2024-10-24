import { BigNumber, BytesLike, ContractFactory, ethers, VoidSigner } from "ethers"
import { TimelockAccepts, CrocPolicy, CrocSwapDex } from "../../typechain"
import { BOOT_PROXY_IDX, COLD_PROXY_IDX, CrocAddrs, CrocGovAddrs, FLAG_CROSS_PROXY_IDX, KNOCKOUT_LP_PROXY_IDX, LONG_PROXY_IDX, LP_PROXY_IDX, MICRO_PROXY_IDX, SAFE_MODE_PROXY_PATH, SWAP_PROXY_IDX } from "../constants/addrs"
import { refContract } from "./chain"
import { ethers as hreEthers } from 'hardhat';
import { BLAST_PROXY_PATH } from "../../test/SetupDex";

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
    delay: number, tag:string): Promise<GovernanceResolution> {
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
    }, tag)
}

export async function treasuryResolution (addrs: CrocAddrs, cmd: CrocProtocolCmd, 
    delay: number, tag: string): Promise<GovernanceResolution> {
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
    }, tag)
}

export async function opsTimelockSet (addrs: CrocAddrs, newDelay: number, oldDelay: number) {
    await timelockDelaySet(addrs.govern.multisigOps, addrs.govern.timelockOps,
        newDelay, oldDelay, `Update ops timelock to ${newDelay} seconds`)
}

export async function treasuryTimelockSet (addrs: CrocAddrs, newDelay: number, oldDelay: number) {
    await timelockDelaySet(addrs.govern.multisigTreasury, addrs.govern.timelockTreasury,
        newDelay, oldDelay, `Update treasury timelock to ${newDelay} seconds`)
}

async function timelockDelaySet (multisigAddr: string,
    timelockAddr: string, newDelay: number, oldDelay: number, tag: string) {
    const timelock = await refContract("TimelockAccepts", timelockAddr) as TimelockAccepts
    let delayCall = await timelock.populateTransaction.updateDelay(newDelay)

    if (newDelay > 7 * 3600 * 24) {
        throw new Error("Timelock delay exceeds seven days")
    }

    let timelockCalls = await populateTimelockCalls(timelock, timelockAddr, delayCall.data as string,
        oldDelay)
        
    console.log("----")
    console.log("Presenting instructions for setting timelock delay")
    console.log()
    console.log("Description: Change update timelock " + tag)
    console.log(`Execution instructions for updating timelock delay`)
    console.log()
    console.log(`Step 1: Use the Gnosis Safe at ${multisigAddr}`)
    console.log(`Transaction to timelock contract at ${timelockAddr}`)
    console.log(`(Message value: 0)`)
    console.log(`With the following calldata: `)
    console.log(timelockCalls.scheduleCalldata)

    console.log()
    console.log(`Step 2: Wait at least ${timelockCalls.delay}`)
    console.log(`Use same Gnosis Safe at ${multisigAddr}`)
    console.log(`Transaction to timelock contract at ${timelockCalls.timelockAddr}`)
    console.log(`(Message value: 0)`)
    console.log(`With the following calldata: `)
    console.log(timelockCalls.execCalldata)
    console.log("-----")
}

export function printResolution (res: GovernanceResolution, tag: string): GovernanceResolution {
    console.log("-----")
    console.log("Presenting instructions for governance resolution", res)
    console.log()
    console.log("Description:", tag)
    console.log(`Execution instructions for ${res.resolutionType} resolution`)
    console.log()
    console.log(`Will execute a protocolCmd() call on CrocSwapDex contract at ${res.dexContract}`)
    console.log("protocolCmd() will be called with args: ", res.protocolCmd)
    console.log()
    console.log(`Step 1: Use the Gnosis Safe at ${res.multisigOrigin}`)
    console.log(`Transaction to timelock contract at ${res.timelockCall.timelockAddr}`)
    console.log(`(Message value: 0)`)
    console.log(`With the following calldata: `)
    console.log(res.timelockCall.scheduleCalldata)
    console.log()
    console.log(`Step 2: Wait at least ${res.timelockCall.delay}`)
    console.log(`Use same Gnosis Safe at ${res.multisigOrigin}`)
    console.log(`Transaction to timelock contract at ${res.timelockCall.timelockAddr}`)
    console.log(`(Message value: 0)`)
    console.log(`With the following calldata: `)
    console.log(res.timelockCall.execCalldata)
    console.log("-----")
    return res
}

export const INIT_TIMELOCK_DELAY = 30

export async function decodePolicyCall (policy: CrocPolicy,
    dex: CrocSwapDex, timelock: TimelockAccepts, payload: string) {

    let policyFn
    let sigHash = payload.slice(0, 10)
    if (sigHash === policy.interface.getSighash("opsResolution")) {
        decodePolicyCalldata("opsResolution", policy, dex, payload)
    } else if (sigHash === policy.interface.getSighash("treasuryResolution")) {
        decodePolicyCalldata("treasuryResolution", policy, dex, payload)
    } else if (sigHash === timelock.interface.getSighash("schedule")) {
        decodeScheduleCalldata("schedule", policy, dex, timelock, payload)
    } else if (sigHash === timelock.interface.getSighash("execute")) {
        decodeScheduleCalldata("execute", policy, dex, timelock, payload)
    } else {
        throw new Error("Unknown function signature")
    }
}

async function decodeScheduleCalldata (decodeFn: string, policy: CrocPolicy,
    dex: CrocSwapDex, timelock: TimelockAccepts, schedData: string) {

    let schedCall = timelock.interface.decodeFunctionData(decodeFn, schedData)
    console.log()
    console.log(`Decoded ${decodeFn} call: `, schedCall)
    if (schedCall.target.toLowerCase() !== policy.address.toLowerCase()) {
        throw new Error("Target of schedule call is not CrocPolicy contract")
    }

    let payload = schedCall.data || schedCall.payload
    decodePolicyCall(policy, dex, timelock, payload)
}

async function decodePolicyCalldata (policyFn: string, policy: CrocPolicy,
    dex: CrocSwapDex, payload: string) {
    let policyCall = policy.interface.decodeFunctionData(policyFn, payload)

    console.log()
    console.log(`Decoded ${policyFn} call: `, policyCall)

    if (policyCall.minion.toLowerCase() !== dex.address.toLowerCase()) {
        throw new Error("Target of CrocPolicy call is not CrocSwapDex contract")
    }

    let proxyName
    if (policyCall.proxyPath === COLD_PROXY_IDX) {
        proxyName = "ColdPath"
    } else if (policyCall.proxyPath === BOOT_PROXY_IDX) {
        proxyName = "BootPath"
    } else if (policyCall.proxyPath === BLAST_PROXY_PATH) {
        proxyName = "BlastPath"
    } else {
        throw new Error("Unknown proxyPath")
    }

    let chunks = splitAbiHex(policyCall.cmd)
    let callCode = BigNumber.from("0x" + chunks[0]).toNumber()
    
    console.log()
    console.log(`ProxyPath: ${proxyName} (${policyCall.proxyPath})`)
    console.log(`cmdCode: ` + callCode)
    console.log("-------")

    chunks.slice(1).forEach((chunk: string, idx: number) => {
        let number = BigNumber.from("0x" + chunk)
        console.log(`Arg ${idx}: 0x` + chunk)
        if (number.lt(BigNumber.from(2).pow(64))) {
            console.log("Numeric Val: " + number.toString())
        } else if (number.lt(BigNumber.from(2).pow(161))) {
            console.log("Address Val: " + "0x" + chunk.slice(24, 64))
        }
        console.log("-------")
    })

    console.log()
    if (callCode === PROTOCOL_AUTH_TRANSFER_CMD && policyCall.proxyPath === COLD_PROXY_IDX) {
        console.log(`Decoded protocolCmd as AuthTransfer to new CrocPolicy`)
        console.log(`New authority: ` + "0x" + chunks[1].slice(24, 64))

    } else if (callCode === PROTOCOL_UPGRADE_CMD && policyCall.proxyPath === BOOT_PROXY_IDX) {
        let proxySlot = BigNumber.from("0x" + chunks[2]).toNumber()
        let proxyLabel = "Unknown"

        if (proxySlot == SWAP_PROXY_IDX) {
            proxyLabel = "HotPath"
        } else if (proxySlot == LP_PROXY_IDX) {
            proxyLabel = "WarmPath"
        } else if (proxySlot == COLD_PROXY_IDX) {
            proxyLabel = "ColdPath"
        } else if (proxySlot == LONG_PROXY_IDX) {
            proxyLabel = "LongPath"
        } else if (proxySlot == MICRO_PROXY_IDX) {
            proxyLabel = "MicroPaths"
        } else if (proxySlot == KNOCKOUT_LP_PROXY_IDX) {
            proxyLabel = "KnockoutLPPath"
        } else if (proxySlot == FLAG_CROSS_PROXY_IDX) {
            proxyLabel = "KnockoutCrossPath"
        } else if (proxySlot == SAFE_MODE_PROXY_PATH) {
            proxyLabel = "SafeModePath"
        } else if (proxySlot == BLAST_PROXY_PATH) {
            proxyLabel = "BlastPath"
        }

        console.log(`Decoded protocolCmd as Proxy Contract Upgrade`)
        console.log(`Proxy Slot: ${proxyLabel} (slot ${proxySlot})`)
        console.log(`New contract: ` + "0x" + chunks[1].slice(24, 64))

    } else if (callCode === PROTOCOL_HOT_OPEN_CMD && policyCall.proxyPath === COLD_PROXY_IDX) {
        let isOpen = BigNumber.from("0x" + chunks[1]).toNumber() > 0
        console.log(`Decoded protocolCmd as HotPath ${isOpen ? "Open" : "Close"}`)

    } else if (callCode === PROTOCOL_BLAST_CLAIM_CMD || callCode === PROTOCOL_BLAST_ERC20_CLAIM_CMD) {
        console.log(`Decoded protocolCmd as Blast yield claim`)

    } else {
        console.log(`Unknown protocolCmd code: ` + callCode)
        console.log(`Check ProtocolCmd.sol for command codes`)
    }
    console.log()
}

function splitAbiHex(hexString: string): string[] {
    // Check if the string starts with '0x' and remove it
    const cleanedHexString = hexString.startsWith('0x') ? hexString.slice(2) : hexString;

    // Define the size of a chunk in characters (32 bytes = 64 characters in hex)
    const chunkSize = 64;

    // Prepare an array to hold the chunks
    let chunks: string[] = [];

    // Loop through the string and extract chunks of 64 characters
    for (let i = 0; i < cleanedHexString.length; i += chunkSize) {
        const chunk = cleanedHexString.substring(i, i + chunkSize);
        chunks.push(chunk);
    }

    return chunks;
}

const PROTOCOL_AUTH_TRANSFER_CMD = 20
const PROTOCOL_UPGRADE_CMD = 21
const PROTOCOL_HOT_OPEN_CMD = 22
const PROTOCOL_BLAST_CLAIM_CMD = 178
const PROTOCOL_BLAST_ERC20_CLAIM_CMD = 179
