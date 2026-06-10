/* Builds the timelock scheduleBatch/executeBatch calldata wrapping all seven
 * patch-sidecar installs into two governance operations. Use on chains where
 * the Safe web frontend is unavailable: feed the printed SAFE_TO / SAFE_DATA
 * pairs to signSafeTx.ts (each owner) and execSafeTx.ts (final submission).
 *
 * Run AFTER deployPatchSidecars.ts and after misc/constants/addrs.ts is
 * updated, same as installPatchSidecars.ts (this is the batched, frontend-less
 * equivalent of that script).
 *
 * env: CHAIN_ID, optional TIMELOCK_DELAY (seconds, default 48h -- note some
 * chains' timelocks have a much lower minDelay, e.g. Blast at 30s). */

import { BigNumber, ethers } from 'ethers';
import { initProvider } from '../../libs/chain';
import {
    BOOT_PROXY_IDX, SWAP_PROXY_IDX, LP_PROXY_IDX, COLD_PROXY_IDX,
    LONG_PROXY_IDX, MICRO_PROXY_IDX, KNOCKOUT_LP_PROXY_IDX, FLAG_CROSS_PROXY_IDX
} from '../../constants/addrs';

const POLICY_IFACE = new ethers.utils.Interface(
    ["function treasuryResolution(address minion, uint16 proxyPath, bytes cmd, bool sudo)"]);

const TIMELOCK_IFACE = new ethers.utils.Interface([
    "function scheduleBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt, uint256 delay)",
    "function executeBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt)",
    "function hashOperationBatch(address[] targets, uint256[] values, bytes[] payloads, bytes32 predecessor, bytes32 salt) view returns (bytes32)"
]);

const abi = new ethers.utils.AbiCoder()

async function build() {
    let { addrs, chainId } = initProvider()

    const delay = parseInt(process.env.TIMELOCK_DELAY || `${24 * 2 * 3600}`)
    const installs: [string, number, string][] = [
        [addrs.hot, SWAP_PROXY_IDX, "hot (swap)"],
        [addrs.warm, LP_PROXY_IDX, "warm (LP)"],
        [addrs.cold, COLD_PROXY_IDX, "cold"],
        [addrs.long, LONG_PROXY_IDX, "long"],
        [addrs.micro, MICRO_PROXY_IDX, "micro"],
        [addrs.knockout, KNOCKOUT_LP_PROXY_IDX, "knockout LP"],
        [addrs.koCross, FLAG_CROSS_PROXY_IDX, "knockout flag (koCross)"],
    ]

    const targets: string[] = []
    const values: BigNumber[] = []
    const payloads: string[] = []
    for (const [address, proxyIdx, tag] of installs) {
        if (!address) {
            throw new Error(`Missing address for ${tag} -- update addrs.ts first`)
        }
        const cmd = abi.encode(["uint8", "address", "uint16"], [21, address, proxyIdx])
        targets.push(addrs.policy)
        values.push(BigNumber.from(0))
        payloads.push(POLICY_IFACE.encodeFunctionData(
            "treasuryResolution", [addrs.dex, BOOT_PROXY_IDX, cmd, true]))
        console.log(`install ${tag}: proxyIdx=${proxyIdx} sidecar=${address}`)
    }

    const salt = ethers.utils.hexZeroPad(BigNumber.from(Date.now()).toHexString(), 32)
    const predecessor = ethers.constants.HashZero

    const schedData = TIMELOCK_IFACE.encodeFunctionData("scheduleBatch",
        [targets, values, payloads, predecessor, salt, delay])
    const execData = TIMELOCK_IFACE.encodeFunctionData("executeBatch",
        [targets, values, payloads, predecessor, salt])
    const opId = ethers.utils.keccak256(abi.encode(
        ["address[]", "uint256[]", "bytes[]", "bytes32", "bytes32"],
        [targets, values, payloads, predecessor, salt]))

    console.log()
    console.log(`chain: ${chainId}, dex: ${addrs.dex}, policy: ${addrs.policy}`)
    console.log(`safe (treasury multisig): ${addrs.govern.multisigTreasury}`)
    console.log(`timelock (treasury):      ${addrs.govern.timelockTreasury}`)
    console.log(`delay: ${delay}s, salt: ${salt}`)
    console.log(`timelock operation id: ${opId}`)
    console.log()
    console.log("=== leg 1: schedule (sign + exec this first) ===")
    console.log(`SAFE_TO=${addrs.govern.timelockTreasury}`)
    console.log(`SAFE_DATA=${schedData}`)
    console.log()
    console.log("=== leg 2: execute (after the delay elapses) ===")
    console.log(`SAFE_TO=${addrs.govern.timelockTreasury}`)
    console.log(`SAFE_DATA=${execData}`)
}

build()
