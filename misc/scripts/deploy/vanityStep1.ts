
/* Workflow to deploy a basic CrocSwapDex contract using a pre-determined
 * create2 vanity salt, then hand off to the CrocPolicy contract. 
 *
 * Call using:
 * npx hardhat run 
 */

import { inflateAddr, initChain } from '../../libs/chain';

async function deploy() {
    let { addrs, chainId, wallet: authority } = initChain()
    console.log(`Deploying CrocSwapDeployer Contract to chain ${chainId}...`)
    console.log("Initial Authority: ")

    let crocDeployer = inflateAddr("CrocDeployer", addrs.deployer, authority, 
        authority.address)
    addrs.deployer = (await crocDeployer).address

    console.log("CrocDeployer: ", addrs.deployer)
    console.log(`Updated addresses for ${chainId}`, addrs)
}

deploy()
