
/* Workflow to deploy a basic CrocSwapDex contract using a pre-determined
 * create2 vanity salt, then hand off to the CrocPolicy contract. 
 *
 * Call using:
 * npx hardhat run 
 */

import { ethers } from 'hardhat';
import { CROC_ADDRS } from '../../constants/addrs';
import { inflateAddr } from '../../libs/postTx';

const CHAIN_ID = '0x1';

let addrs = CROC_ADDRS[CHAIN_ID]

async function deploy() {
    let authority = (await ethers.getSigners())[0]

    console.log(`Deploying CrocSwapDeployer Contract to ${CHAIN_ID}...`)
    console.log("Initial Authority: ", authority.address)

    let crocDeployer = inflateAddr("CrocDeployer", addrs.deployer, authority.address)
    addrs.deployer = (await crocDeployer).address

    console.log("CrocDeployer: ", addrs.deployer)
    console.log(`Updated addresses for ${CHAIN_ID}`, addrs)
}

deploy()
