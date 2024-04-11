/* Workflow to transfer control of the newly deployed CrocSwapDex contract away
 * from the CrocDeployer to a CrocPolicy contract under the control of the authority
 * wallet. (Also installs ColdPath as necessary part of the workflow)
 */

import { ColdPath, CrocDeployer, CrocPolicy, CrocSwapDex } from '../../../typechain';
import { BOOT_PROXY_IDX, COLD_PROXY_IDX } from '../../constants/addrs';
import { inflateAddr, initChain, refContract, traceContractTx, traceTxResp } from '../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';

const abi = new AbiCoder()

async function vanityDeploy() {
    let { addrs, chainId, wallet: authority } = initChain()

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
    await traceContractTx(crocDeployer.protocolCmd(addrs.dex, BOOT_PROXY_IDX, cmd, true, {"gasLimit": 1000000}), 
        "Cold Path Install")

    cmd = abi.encode(["uint8", "address"], [20, policy.address])
    await traceContractTx(crocDeployer.protocolCmd(addrs.dex, COLD_PROXY_IDX, cmd, true, {"gasLimit": 1000000}), 
        "Transfer to Policy Contract")

    console.log(`Updated addresses for ${chainId}`, addrs)
}

vanityDeploy()
