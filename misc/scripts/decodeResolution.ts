import { initProvider, refContract } from '../libs/chain';
import { decodePolicySched, treasuryResolution, CrocProtocolCmd } from '../libs/governance';
import { CrocSwapDex, TimelockAccepts } from '../../typechain';
import { CrocPolicy } from '../../typechain';
import { AbiCoder } from '@ethersproject/abi';

async function decode (calldata: string) {
    let { addrs } = initProvider()
    const abi = new AbiCoder()

    let timelock = refContract("TimelockAccepts", addrs.govern.timelockOps) as Promise<TimelockAccepts>
    let policy = refContract("CrocPolicy", addrs.policy) as Promise<CrocPolicy>
    let dex = refContract("CrocSwapDex", addrs.dex) as Promise<CrocSwapDex>

    decodePolicySched(await timelock, await policy, await dex, calldata)
}

const calldata = process.env.CMD_CALLDATA
if (!calldata) {
    throw new Error("Set CMD_CALLDATA env var")
}
decode(calldata)
