/* Submits a Safe transaction with collected owner signatures, without the
 * Safe web frontend. Validates signers against the owner set and threshold
 * before broadcasting; the submitting wallet only pays gas and does not need
 * to be an owner.
 *
 * env: CHAIN_ID,
 *      WALLET_KEY (any funded key; optional when PRINT_ONLY is set),
 *      SAFE_TO, SAFE_DATA (identical to what was signed),
 *      SAFE_SIGS (comma-separated 65-byte signatures from signSafeTx.ts,
 *          and/or "approved:0x<owner>" entries for the approveHash flow),
 *      optional PRINT_ONLY (validate and print execTransaction fields for
 *          submission through an explorer's Write-as-Proxy UI),
 *      optional SAFE_ADDR (default: treasury multisig from addrs.ts),
 *      optional SAFE_NONCE (must match what was signed if the Safe nonce
 *      has moved since).
 *
 * NOTE: env vars must reach the child process -- either `export` them or
 * prefix them on the same command line as `npx hardhat run`. */

import { BigNumber, Contract, Wallet, ethers } from 'ethers';
import { feeOverrides, initProvider } from '../../libs/chain';
import { SAFE_ABI, buildSafeTx, packSignatures, safeTxDigest } from '../../libs/safe';

const USAGE = `usage:
  CHAIN_ID=0x13e31 \\
  SAFE_TO=0x<target> SAFE_DATA=0x<calldata> \\
  SAFE_SIGS="approved:0x<ownerA>,approved:0x<ownerB>" \\
  [WALLET_KEY=0x<funded key> | PRINT_ONLY=1] \\
  npx hardhat run misc/scripts/safe/execSafeTx.ts`

function requireEnv (name: string): string {
    const val = process.env[name]
    if (!val) { throw new Error(`Missing env var ${name}\n${USAGE}`) }
    return val
}

async function exec() {
    requireEnv("CHAIN_ID")
    const to = requireEnv("SAFE_TO")
    const data = requireEnv("SAFE_DATA")
    const sigsRaw = requireEnv("SAFE_SIGS")
    if (!process.env.WALLET_KEY && !process.env.PRINT_ONLY) {
        throw new Error(`Set WALLET_KEY (to broadcast) or PRINT_ONLY=1 (to print calldata)\n${USAGE}`)
    }

    let { addrs, chainId, provider } = initProvider()
    const wallet: Wallet | null = process.env.WALLET_KEY ?
        new ethers.Wallet(process.env.WALLET_KEY.toLowerCase(), provider) : null

    const safeAddr = process.env.SAFE_ADDR || addrs.govern.multisigTreasury
    const safe = new Contract(safeAddr, SAFE_ABI, wallet ? wallet : provider)

    const nonce = process.env.SAFE_NONCE !== undefined ?
        BigNumber.from(process.env.SAFE_NONCE) : await safe.nonce()
    const numericChain = parseInt(chainId, 16)

    const tx = buildSafeTx(to, data, nonce)
    const sigs = sigsRaw.split(",").map(s => s.trim())
    const { packed, signers } = packSignatures(numericChain, safeAddr, tx, sigs)

    const owners: string[] = (await safe.getOwners()).map((o: string) => o.toLowerCase())
    const threshold: BigNumber = await safe.getThreshold()
    for (const s of signers) {
        if (!owners.includes(s.toLowerCase())) {
            throw new Error(`Recovered signer ${s} is not a Safe owner -- ` +
                `check SAFE_TO/SAFE_DATA/SAFE_NONCE match what was signed`)
        }
    }
    if (signers.length < threshold.toNumber()) {
        throw new Error(`Have ${signers.length} signatures, threshold is ${threshold}`)
    }

    // Approved-hash entries are only valid if the owner already called
    // approveHash on-chain, or is the wallet submitting this transaction.
    const digest = safeTxDigest(numericChain, safeAddr, tx)
    for (const entry of sigs) {
        if (entry.toLowerCase().startsWith("approved:")) {
            const owner = entry.slice("approved:".length)
            if (wallet && owner.toLowerCase() === wallet.address.toLowerCase()) { continue }
            const approved: BigNumber = await safe.approvedHashes(owner, digest)
            if (approved.isZero()) {
                throw new Error(`Owner ${owner} has not called approveHash(${digest}) ` +
                    `and is not the submitting wallet`)
            }
        }
    }

    console.log(`safe: ${safeAddr} nonce: ${nonce.toString()}`)
    console.log(`safeTxHash: ${safeTxDigest(numericChain, safeAddr, tx)}`)
    console.log(`signers (sorted): ${signers}`)

    if (process.env.PRINT_ONLY) {
        console.log()
        console.log("PRINT_ONLY set -- not broadcasting. To submit via an explorer's")
        console.log("'Write as Proxy' UI, call execTransaction with:")
        console.log(`  to:             ${tx.to}`)
        console.log(`  value:          0`)
        console.log(`  data:           ${tx.data}`)
        console.log(`  operation:      0`)
        console.log(`  safeTxGas:      0`)
        console.log(`  baseGas:        0`)
        console.log(`  gasPrice:       0`)
        console.log(`  gasToken:       ${tx.gasToken}`)
        console.log(`  refundReceiver: ${tx.refundReceiver}`)
        console.log(`  signatures:     ${packed}`)
        return
    }

    const resp = await safe.execTransaction(
        tx.to, tx.value, tx.data, tx.operation, tx.safeTxGas, tx.baseGas,
        tx.gasPrice, tx.gasToken, tx.refundReceiver, packed,
        { gasLimit: 3000000, ...feeOverrides() })
    console.log(`submitted: ${resp.hash}`)
    const receipt = await resp.wait()
    console.log(`status: ${receipt.status === 1 ? "SUCCESS" : "FAILED"} (block ${receipt.blockNumber})`)
}

exec()
