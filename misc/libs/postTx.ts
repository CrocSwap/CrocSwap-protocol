import { TransactionReceipt, TransactionResponse } from "@ethersproject/providers";
import { Contract } from "ethers";
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

export async function inflateAddr (contractName: string, addr: string, 
    ...args: any[]): Promise<Contract> {
    const tag = `Contract deploy for ${contractName}`
    const factory = await ethers.getContractFactory("CrocDeployer")

    if (addr) {
        return factory.attach(addr)
    } else {
        const contract = factory.deploy(...args)
        return traceContractDeploy(contract, tag)
    }
}
