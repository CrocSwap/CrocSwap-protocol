import { JsonRpcProvider, TransactionReceipt, TransactionResponse } from "@ethersproject/providers";
import { BigNumber, BytesLike, Contract, ContractTransaction, Signer, Wallet } from "ethers";
import { ethers } from "hardhat"
import { TimelockAccepts } from "../../typechain";
import { CrocAddrs, CROC_ADDRS } from "../constants/addrs";
import { CrocCrossPoolParams, CrocPoolParams, CROC_POOL_PARAMS } from "../constants/poolParams";
import { RPC_URLS } from "../constants/rpcs";

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
    authority?: Signer): Promise<Contract> {
    if (!addr) {
        throw new Error(`No contract initialized for ${contractName} at ${addr}`)
    }

    let factory = (await ethers.getContractFactory(contractName))
    if (authority) {
        factory = factory.connect(authority)
    }

    const contract = factory.attach(addr)
    return contract
}

export function initChain (chainId?: string): 
    { wallet: Wallet, addrs: CrocAddrs, chainId: string, poolParams: CrocPoolParams } {

    chainId = chainId || process.env.CHAIN_ID || 'mock';
    const addrs = CROC_ADDRS[chainId as keyof typeof CROC_ADDRS]
    const rpcUrl = RPC_URLS[chainId as keyof typeof RPC_URLS]
    const poolParams = CROC_POOL_PARAMS[chainId as keyof typeof CROC_POOL_PARAMS]

    console.log(rpcUrl)

    const provider = new JsonRpcProvider(rpcUrl)
    const key = process.env.WALLET_KEY as string
    const wallet = new Wallet(key.toLowerCase()).connect(provider)

    return { addrs, wallet, chainId, poolParams }
}

