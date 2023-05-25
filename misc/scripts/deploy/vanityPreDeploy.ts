
/* Workflow to deploy a basic CrocSwapDex contract using a pre-determined
 * create2 vanity salt, then hand off to the CrocPolicy contract. 
 *
 * Call using:
 * npx hardhat run 
 */

import { CROC_ADDRS } from '../../constants/addrs';
import { RPC_URLS } from '../../constants/rpcs';
import { inflateAddr, initWallet } from '../../libs/chain';

// To run on different chain, change this value
//const CHAIN_ID = '0x1';

const CHAIN_ID = 'mock'

let addrs = CROC_ADDRS[CHAIN_ID]
const rpcUrl = RPC_URLS[CHAIN_ID]

async function deploy() {
    const authority = initWallet(rpcUrl)
    console.log(`Deploying CrocSwapDeployer Contract to ${CHAIN_ID}...`)
    console.log("Initial Authority: ")

    let crocDeployer = inflateAddr("CrocDeployer", addrs.deployer, authority)
    addrs.deployer = (await crocDeployer).address

    console.log("CrocDeployer: ", addrs.deployer)
    console.log(`Updated addresses for ${CHAIN_ID}`, addrs)
}

deploy()
