/* Minimal Gnosis Safe (v1.3.0) transaction tooling for chains where the Safe
 * web frontend / transaction service is no longer available. The Safe contract
 * itself remains fully operational -- these helpers replace only the off-chain
 * signature coordination: build the EIP-712 SafeTx, have threshold owners sign
 * it out-of-band, then anyone submits execTransaction with the packed
 * signatures. */

import { BigNumber, BytesLike, Wallet, ethers } from 'ethers';

export const SAFE_ABI = [
    "function nonce() view returns (uint256)",
    "function getThreshold() view returns (uint256)",
    "function getOwners() view returns (address[])",
    "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) payable returns (bool)"
];

export interface SafeTx {
    to: string,
    value: BigNumber,
    data: BytesLike,
    operation: number,
    safeTxGas: BigNumber,
    baseGas: BigNumber,
    gasPrice: BigNumber,
    gasToken: string,
    refundReceiver: string,
    nonce: BigNumber
}

export const SAFE_TX_TYPES = {
    SafeTx: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
        { name: "operation", type: "uint8" },
        { name: "safeTxGas", type: "uint256" },
        { name: "baseGas", type: "uint256" },
        { name: "gasPrice", type: "uint256" },
        { name: "gasToken", type: "address" },
        { name: "refundReceiver", type: "address" },
        { name: "nonce", type: "uint256" }
    ]
};

/* Plain CALL with no gas refund games -- the only shape we use for
 * governance operations. */
export function buildSafeTx (to: string, data: BytesLike, nonce: BigNumber): SafeTx {
    return {
        to: to,
        value: BigNumber.from(0),
        data: data,
        operation: 0,
        safeTxGas: BigNumber.from(0),
        baseGas: BigNumber.from(0),
        gasPrice: BigNumber.from(0),
        gasToken: ethers.constants.AddressZero,
        refundReceiver: ethers.constants.AddressZero,
        nonce: nonce
    };
}

/* Safe v1.3.0 domain binds chainId and the Safe proxy address. */
export function safeDomain (chainId: number, safeAddr: string) {
    return { chainId: chainId, verifyingContract: safeAddr };
}

export function safeTxDigest (chainId: number, safeAddr: string, tx: SafeTx): string {
    return ethers.utils._TypedDataEncoder.hash(
        safeDomain(chainId, safeAddr), SAFE_TX_TYPES, tx);
}

/* The typed-data payload in eth_signTypedData_v4 JSON form, for owners signing
 * with external tooling (e.g. `cast wallet sign --data '<json>'`, Frame, or a
 * hardware wallet bridge). */
export function safeTxTypedDataJson (chainId: number, safeAddr: string, tx: SafeTx): string {
    return JSON.stringify({
        types: {
            EIP712Domain: [
                { name: "chainId", type: "uint256" },
                { name: "verifyingContract", type: "address" }
            ],
            ...SAFE_TX_TYPES
        },
        primaryType: "SafeTx",
        domain: { chainId: chainId, verifyingContract: safeAddr },
        message: {
            to: tx.to,
            value: tx.value.toString(),
            data: ethers.utils.hexlify(tx.data),
            operation: tx.operation,
            safeTxGas: tx.safeTxGas.toString(),
            baseGas: tx.baseGas.toString(),
            gasPrice: tx.gasPrice.toString(),
            gasToken: tx.gasToken,
            refundReceiver: tx.refundReceiver,
            nonce: tx.nonce.toString()
        }
    });
}

export async function signSafeTx (wallet: Wallet, chainId: number, safeAddr: string,
                                  tx: SafeTx): Promise<string> {
    return wallet._signTypedData(safeDomain(chainId, safeAddr), SAFE_TX_TYPES, tx);
}

/* Safe requires signatures concatenated in ascending order of recovered owner
 * address. Returns the packed bytes and the recovered signers for display. */
export function packSignatures (chainId: number, safeAddr: string, tx: SafeTx,
                                sigs: string[]): { packed: string, signers: string[] } {
    const digest = safeTxDigest(chainId, safeAddr, tx);
    const bySigner = sigs.map(s => {
        return { signer: ethers.utils.recoverAddress(digest, s), sig: s };
    });
    bySigner.sort((a, b) =>
        a.signer.toLowerCase() < b.signer.toLowerCase() ? -1 : 1);
    const packed = "0x" + bySigner.map(s => s.sig.slice(2)).join("");
    return { packed, signers: bySigner.map(s => s.signer) };
}
