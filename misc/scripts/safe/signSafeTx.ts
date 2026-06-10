/* Prepares (and optionally signs) a Safe transaction without the Safe web
 * frontend. Prints the safeTxHash, the EIP-712 typed data for external
 * signers, and the approveHash calldata for the hardware-wallet flow.
 *
 * Each owner runs this independently (or signs the printed typed-data JSON
 * with external tooling like `cast wallet sign --data '<json>'`) and sends
 * the resulting signature to whoever submits via execSafeTx.ts.
 *
 * env: CHAIN_ID (e.g. 0x13e31 for Blast),
 *      SAFE_TO, SAFE_DATA (from buildInstallBatch.ts or any tx builder),
 *      optional WALLET_KEY (only to locally sign; omit when owners sign via
 *          approveHash or external tooling),
 *      optional SAFE_ADDR (default: treasury multisig from addrs.ts),
 *      optional SAFE_NONCE (default: read live from the Safe).
 *
 * NOTE: env vars must reach the child process -- either `export` them or
 * prefix them on the same command line as `npx hardhat run`. */

import { BigNumber, Contract, ethers } from 'ethers';
import { initProvider } from '../../libs/chain';
import { SAFE_ABI, approveHashCalldata, buildSafeTx, safeTxDigest,
         safeTxTypedDataJson, signSafeTx } from '../../libs/safe';

const USAGE = `usage:
  CHAIN_ID=0x13e31 \\
  SAFE_TO=0x<target contract> \\
  SAFE_DATA=0x<calldata> \\
  npx hardhat run misc/scripts/safe/signSafeTx.ts`

function requireEnv (name: string): string {
    const val = process.env[name]
    if (!val) { throw new Error(`Missing env var ${name}\n${USAGE}`) }
    return val
}

async function sign() {
    requireEnv("CHAIN_ID")
    const to = requireEnv("SAFE_TO")
    const data = requireEnv("SAFE_DATA")

    let { addrs, chainId, provider } = initProvider()

    const safeAddr = process.env.SAFE_ADDR || addrs.govern.multisigTreasury
    const safe = new Contract(safeAddr, SAFE_ABI, provider)

    const nonce = process.env.SAFE_NONCE !== undefined ?
        BigNumber.from(process.env.SAFE_NONCE) : await safe.nonce()
    const numericChain = parseInt(chainId, 16)

    const tx = buildSafeTx(to, data, nonce)
    const digest = safeTxDigest(numericChain, safeAddr, tx)

    console.log(`safe: ${safeAddr} (chain ${numericChain})`)
    console.log(`owners: ${await safe.getOwners()}`)
    console.log(`threshold: ${await safe.getThreshold()}`)
    console.log(`safe nonce: ${nonce.toString()}`)
    console.log(`safeTxHash: ${digest}`)
    console.log()
    console.log("typed data (for external EIP-712 signers, e.g.")
    console.log("  cast wallet sign --ledger --data '<json>'):")
    console.log(safeTxTypedDataJson(numericChain, safeAddr, tx))
    console.log()
    console.log("hardware-wallet alternative (no typed-data support needed):")
    console.log("send a plain transaction from the owner device calling approveHash --")
    console.log(`  to:       ${safeAddr}`)
    console.log(`  calldata: ${approveHashCalldata(digest)}`)
    console.log(`  e.g. cast send --ledger ${safeAddr} 'approveHash(bytes32)' ${digest} --rpc-url <rpc>`)
    console.log(`then pass "approved:<ownerAddr>" in SAFE_SIGS to execSafeTx.ts`)
    console.log()

    if (process.env.WALLET_KEY) {
        const wallet = new ethers.Wallet(process.env.WALLET_KEY.toLowerCase())
        const sig = await signSafeTx(wallet, numericChain, safeAddr, tx)
        console.log(`signer: ${wallet.address}`)
        console.log(`signature: ${sig}`)
    } else {
        console.log("(WALLET_KEY not set -- no local signature produced; use the")
        console.log(" approveHash flow or external typed-data signing above)")
    }
}

sign()
