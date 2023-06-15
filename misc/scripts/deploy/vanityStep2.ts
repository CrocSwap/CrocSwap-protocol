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
import { initChain, refContract, traceContractTx, traceTxResp } from '../../libs/chain';
import { RPC_URLS } from '../../constants/rpcs';

async function vanityDeploy() {
    let { addrs, chainId, wallet: authority } = initChain()

    const salt = mapSalt(addrs.deployer)

    console.log("Deploying with the following addresses...")
    console.log("Protocol Authority: ", authority.address)
    console.log("Using CREATE2 salt", salt.toString())

    let crocDeployer = await refContract("CrocDeployer", addrs.deployer, 
        authority) as CrocDeployer

    const factory = await ethers.getContractFactory("CrocSwapDex")
    await traceContractTx(crocDeployer.deploy(factory.bytecode, salt), "Salted Deploy")
    addrs.dex = await crocDeployer.dex_();

    console.log("CrocSwapDex deployed at: ", addrs.dex)
    console.log(`Updated addresses for ${chainId}`, addrs)
}

vanityDeploy()
