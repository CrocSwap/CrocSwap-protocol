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
import { BOOT_PROXY_IDX, COLD_PROXY_IDX, CROC_ADDRS } from '../../constants/addrs';
import { inflateAddr, initWallet, refContract, traceContractTx, traceTxResp } from '../../libs/chain';
import { RPC_URLS } from '../../constants/rpcs';
import { AbiCoder } from '@ethersproject/abi';

const CHAIN_ID = 'mock';

let addrs = CROC_ADDRS[CHAIN_ID]
const rpcUrl = RPC_URLS[CHAIN_ID]

const abi = new AbiCoder()

async function vanityDeploy() {
    const authority = initWallet(rpcUrl)

    const crocSwap = await refContract("CrocSwapDex", addrs.dex, authority) as CrocSwapDex
    const crocDeployer = await refContract("CrocDeployer", addrs.deployer, 
        authority) as CrocDeployer

    const coldPath = await inflateAddr("ColdPath", addrs.cold, authority) as ColdPath
    addrs.cold = coldPath.address

    const policy = await inflateAddr("CrocPolicy", addrs.policy, 
        authority, addrs.dex) as CrocPolicy
    addrs.policy = policy.address

    console.log(`Updated addresses for ${CHAIN_ID}`, addrs)

    let cmd;

    // Install cold path proxy, so we can transfer ownership
    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.cold, COLD_PROXY_IDX])
    await traceContractTx(crocDeployer.protocolCmd(addrs.dex, BOOT_PROXY_IDX, cmd, true), 
        "Cold Path Install")

    cmd = abi.encode(["uint8", "address"], [20, policy.address])
    await traceContractTx(crocDeployer.protocolCmd(addrs.dex, COLD_PROXY_IDX, cmd, true), 
        "Transfer to Policy Contract")

    console.log(`Updated addresses for ${CHAIN_ID}`, addrs)
}

vanityDeploy()
