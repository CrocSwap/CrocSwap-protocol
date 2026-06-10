/* Submits a Safe transaction with collected owner signatures, without the
 * Safe web frontend. Validates signers against the owner set and threshold
 * before broadcasting; the submitting wallet only pays gas and does not need
 * to be an owner.
 *
 * env: CHAIN_ID, WALLET_KEY (any funded key),
 *      SAFE_TO, SAFE_DATA (identical to what was signed),
 *      SAFE_SIGS (comma-separated 65-byte signatures from signSafeTx.ts),
 *      optional SAFE_ADDR (default: treasury multisig from addrs.ts),
 *      optional SAFE_NONCE (must match what was signed if the Safe nonce
 *      has moved since). */

import { BigNumber, Contract } from 'ethers';
import { initChain } from '../../libs/chain';
import { SAFE_ABI, buildSafeTx, packSignatures, safeTxDigest } from '../../libs/safe';

async function exec() {
    let { addrs, chainId, wallet } = initChain()

    const to = process.env.SAFE_TO as string
    const data = process.env.SAFE_DATA as string
    const sigsRaw = process.env.SAFE_SIGS as string
    if (!to || !data || !sigsRaw) { throw new Error("Set SAFE_TO, SAFE_DATA and SAFE_SIGS") }

    const safeAddr = process.env.SAFE_ADDR || addrs.govern.multisigTreasury
    const safe = new Contract(safeAddr, SAFE_ABI, wallet)

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
            if (owner.toLowerCase() === wallet.address.toLowerCase()) { continue }
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

    const resp = await safe.execTransaction(
        tx.to, tx.value, tx.data, tx.operation, tx.safeTxGas, tx.baseGas,
        tx.gasPrice, tx.gasToken, tx.refundReceiver, packed,
        { gasLimit: 3000000 })
    console.log(`submitted: ${resp.hash}`)
    const receipt = await resp.wait()
    console.log(`status: ${receipt.status === 1 ? "SUCCESS" : "FAILED"} (block ${receipt.blockNumber})`)
}

exec()
