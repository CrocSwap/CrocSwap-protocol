/* Workflow to deploy a basic CrocSwapDex contract using a pre-determined
 * create2 vanity salt, then hand off to the CrocPolicy contract. 
 *
 * Call using:
 * npx hardhat run 
 */

import { ColdPath, CrocDeployer, CrocPolicy, CrocSwapDex } from '../../../typechain';
import { BOOT_PROXY_IDX, COLD_PROXY_IDX } from '../../constants/addrs';
import { inflateAddr, initChain, refContract, traceContractTx, traceTxResp } from '../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';

const abi = new AbiCoder()

async function vanityDeploy() {
    let { addrs, chainId, wallet: authority } = initChain()

    const crocSwap = await refContract("CrocSwapDex", addrs.dex, authority) as CrocSwapDex
    const crocDeployer = await refContract("CrocDeployer", addrs.deployer, 
        authority) as CrocDeployer

    const coldPath = await inflateAddr("ColdPath", addrs.cold, authority) as ColdPath
    addrs.cold = coldPath.address

    const policy = await inflateAddr("CrocPolicy", addrs.policy, 
        authority, addrs.dex) as CrocPolicy
    addrs.policy = policy.address

    console.log(`Updated addresses for ${chainId}`, addrs)

    let cmd;

    // Install cold path proxy, so we can transfer ownership
    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.cold, COLD_PROXY_IDX])
    await traceContractTx(crocDeployer.protocolCmd(addrs.dex, BOOT_PROXY_IDX, cmd, true), 
        "Cold Path Install")

    cmd = abi.encode(["uint8", "address"], [20, policy.address])
    await traceContractTx(crocDeployer.protocolCmd(addrs.dex, COLD_PROXY_IDX, cmd, true), 
        "Transfer to Policy Contract")

    console.log(`Updated addresses for ${chainId}`, addrs)
}

vanityDeploy()
