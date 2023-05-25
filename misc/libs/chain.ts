import { JsonRpcProvider, TransactionReceipt, TransactionResponse } from "@ethersproject/providers";
import { BigNumber, Contract, ContractTransaction, Signer, Wallet } from "ethers";
import { ethers } from "hardhat"

export async function traceContractDeploy 
    (deployTx: Promise<Contract>, tag: string): Promise<Contract> {
    const tx = (await deployTx).deployTransaction
    await traceTxResp(tx, tag)
    return deployTx
}

export async function traceTxResp 
    (resp: TransactionResponse, tag: string): Promise<TransactionReceipt> {
    console.log(`Waiting for transction response for ${tag}: `, resp)
    const receipt = resp.wait()
    console.log(`Received transaction receipt for ${tag}: `, await receipt)
    return receipt
}

export async function traceContractTx
    (tx: Promise<ContractTransaction>, tag: string): Promise<TransactionReceipt> {
    console.log(`Waiting for contract transaction for ${tag}: `, await tx)
    return traceTxResp(await tx, tag)
}

export async function inflateAddr (contractName: string, addr: string,
    authority: Signer, ...args: any[]): Promise<Contract> {
    
    const tag = `Contract deploy for ${contractName}`
    const factory = (await ethers.getContractFactory(contractName))
        .connect(authority)

    if (addr) {
        return factory.attach(addr)
    } else {
        const contract = factory.deploy(...args)
        return traceContractDeploy(contract, tag)
    }
}

export async function refContract (contractName: string, addr: string, 
    authority: Signer): Promise<Contract> {
    if (!addr) {
        throw new Error(`No contract initialized for ${contractName} at ${addr}`)
    }

    const factory = (await ethers.getContractFactory(contractName))
        .connect(authority)

    const contract = factory.attach(addr)
    return contract
}

export function initWallet (rpcUrl: string) {
    const provider = new JsonRpcProvider(rpcUrl)
    const key = process.env.WALLET_KEY as string
    return new Wallet(key.toLowerCase()).connect(provider)
}