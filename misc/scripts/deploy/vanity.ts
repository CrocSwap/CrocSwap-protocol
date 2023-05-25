/* Workflow to deploy a basic CrocSwapDex contract using a pre-determined
 * create2 vanity salt, then hand off to the CrocPolicy contract. 
 *
 * Call using:
 * npx hardhat run 
 */

import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { ColdPath, CrocDeployer, CrocPolicy, CrocSwapDex } from '../../../typechain';
import { mapSalt } from '../../constants/salts';
import { CROC_ADDRS } from '../../constants/addrs';
import { initWallet, refContract, traceContractTx, traceTxResp } from '../../libs/chain';
import { RPC_URLS } from '../../constants/rpcs';

const CHAIN_ID = 'mock';

let addrs = CROC_ADDRS[CHAIN_ID]
const rpcUrl = RPC_URLS[CHAIN_ID]

async function vanityDeploy() {
    const authority = initWallet(rpcUrl)

    const salt = mapSalt(addrs.deployer)

    console.log("Deploying with the following addresses...")
    console.log("Protocol Authority: ", authority.address)
    console.log("Using CREATE2 salt", salt.toString())

    let crocDeployer = await refContract("CrocDeployer", addrs.deployer, 
        authority) as CrocDeployer

    const factory = await ethers.getContractFactory("CrocSwapDex")
    await traceContractTx(crocDeployer.deploy(factory.bytecode, salt), "Salted Deploy")
    const dex = await crocDeployer.dex_();

    console.log("CrocSwapDex deployed at: ", dex)
    const crocSwap = factory.attach(dex) as CrocSwapDex

    console.log(`Updated addresses for ${CHAIN_ID}`, addrs)

    /* factory = await ethers.getContractFactory("ColdPath")
    let coldPath = addrs.cold ? factory.attach(addrs.cold) :
        await factory.deploy({gasPrice: ethers.provider.getGasPrice()}) as ColdPath
    addrs.cold = coldPath.address

    factory = await ethers.getContractFactory("CrocPolicy")
    let policy = (addrs.policy ? factory.attach(addrs.policy) :
        await factory.deploy(dex, { gasPrice: ethers.provider.getGasPrice()})) as CrocPolicy
    addrs.policy = policy.address

    console.log(addrs)

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.cold, COLD_PROXY_IDX])
    tx = await crocDeployer.protocolCmd(dex, BOOT_PROXY_IDX, cmd, true, {gasPrice: ethers.provider.getGasPrice()})
    await tx

    cmd = abi.encode(["uint8", "address"], [20, policy.address])
    tx = await crocDeployer.protocolCmd(dex, COLD_PROXY_IDX, cmd, true, {gasPrice: ethers.provider.getGasPrice()});
    await tx.wait()

    console.log(await crocSwap.readSlot(65537))*/
}

vanityDeploy()
