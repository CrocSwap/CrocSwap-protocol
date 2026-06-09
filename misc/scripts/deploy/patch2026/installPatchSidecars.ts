/* Generates the timelock resolutions that install the 2026 patch sidecars
 * into the dex's proxy slots. Run AFTER deployPatchSidecars.ts and after
 * misc/constants/addrs.ts has been updated with the new addresses, so the
 * install commands below pick up the new contracts.
 *
 * This produces the schedule/execute calldata for the treasury multisig (it
 * does not execute anything itself). Verify the emitted calldata with
 * misc/scripts/decodeResolution.ts before scheduling, and after the timelock
 * delay elapses confirm installation by reading the dex's proxy slots
 * on-chain.
 *
 * Proxy indices are imported from misc/constants/addrs.ts, which carries the
 * correct values per code line (L1: LP=2/LONG=4/MICRO=5; L2: 128/130/131) --
 * the same script works on both lines when run from the right branch.
 */

import { AbiCoder } from '@ethersproject/abi';
import { initChain } from '../../../libs/chain';
import { CrocProtocolCmd, treasuryResolution } from '../../../libs/governance';
import {
    BOOT_PROXY_IDX, SWAP_PROXY_IDX, LP_PROXY_IDX, COLD_PROXY_IDX,
    LONG_PROXY_IDX, MICRO_PROXY_IDX, KNOCKOUT_LP_PROXY_IDX, FLAG_CROSS_PROXY_IDX
} from '../../../constants/addrs';

const abi = new AbiCoder()

// Matches the delay used in prior upgrade rounds
const DELAY = 24 * 2 * 3600

async function install() {
    let { addrs } = initChain()

    const installs: [string, number, string][] = [
        [addrs.hot, SWAP_PROXY_IDX, "Install hot proxy (swap) sidecar"],
        [addrs.warm, LP_PROXY_IDX, "Install warm path (LP) sidecar"],
        [addrs.cold, COLD_PROXY_IDX, "Install cold path sidecar"],
        [addrs.long, LONG_PROXY_IDX, "Install long path sidecar"],
        [addrs.micro, MICRO_PROXY_IDX, "Install micro paths sidecar"],
        [addrs.knockout, KNOCKOUT_LP_PROXY_IDX, "Install knockout LP path sidecar"],
        [addrs.koCross, FLAG_CROSS_PROXY_IDX, "Install knockout flag (koCross) sidecar"],
    ]

    for (const [address, proxyIdx, tag] of installs) {
        if (!address) {
            throw new Error(`Missing address for "${tag}" -- update addrs.ts before generating resolutions`)
        }
        const cmd = abi.encode(["uint8", "address", "uint16"], [21, address, proxyIdx])
        const installCmd: CrocProtocolCmd = {
            protocolCmd: cmd,
            callpath: BOOT_PROXY_IDX,
            sudo: true
        }
        await treasuryResolution(addrs, installCmd, DELAY, tag)
    }
}

install()
