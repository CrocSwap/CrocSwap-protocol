/* Signs a Safe transaction as one owner, without the Safe web frontend.
 *
 * Each owner runs this independently (or signs the printed typed-data JSON
 * with external tooling like `cast wallet sign --data '<json>'`) and sends
 * the resulting signature to whoever submits via execSafeTx.ts.
 *
 * env: CHAIN_ID, WALLET_KEY (this owner's key),
 *      SAFE_TO, SAFE_DATA (from buildInstallBatch.ts or any tx builder),
 *      optional SAFE_ADDR (default: treasury multisig from addrs.ts),
 *      optional SAFE_NONCE (default: read live from the Safe). */

import { BigNumber, Contract, ethers } from 'ethers';
import { initChain } from '../../libs/chain';
import { SAFE_ABI, approveHashCalldata, buildSafeTx, safeTxDigest,
         safeTxTypedDataJson, signSafeTx } from '../../libs/safe';

async function sign() {
    let { addrs, chainId, wallet } = initChain()

    const to = process.env.SAFE_TO as string
    const data = process.env.SAFE_DATA as string
    if (!to || !data) { throw new Error("Set SAFE_TO and SAFE_DATA") }

    const safeAddr = process.env.SAFE_ADDR || addrs.govern.multisigTreasury
    const safe = new Contract(safeAddr, SAFE_ABI, wallet.provider)

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

    const sig = await signSafeTx(wallet, numericChain, safeAddr, tx)
    console.log(`signer: ${wallet.address}`)
    console.log(`signature: ${sig}`)
}

sign()
