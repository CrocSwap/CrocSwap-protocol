/* Workflow to deploy a basic CrocSwapDex contract using a pre-determined
 * create2 vanity salt, then hand off to the CrocPolicy contract. 
 *
 * Call using:
 * npx hardhat run 
 * 
 * Make sure vanity steps from the general purpose deploy is called first
 */

import { AbiCoder } from '@ethersproject/abi';
import { AuctionPath, ColdPath, CrocAuctionQuery, CrocDeployer, CrocPolicy, CrocQuery, CrocSwapDex, FutaLauncher } from '../../../../typechain';
import { AUCTION_PROXY_IDX, BOOT_PROXY_IDX, COLD_PROXY_IDX } from '../../../constants/addrs';
import { inflateAddr, initChain, refContract, traceContractTx, traceTxResp } from '../../../libs/chain';

const abi = new AbiCoder()

async function vanityDeploy() {
    let { addrs, chainId, wallet: authority } = initChain()

    const futa = await inflateAddr("FutaLauncher", addrs.futa?.futa || "", authority,
        addrs.auction?.dex, addrs.dex, addrs.auction?.query, addrs.auction?.auctionPath, 420
    ) as FutaLauncher

    addrs.auction.futa = futa.address

    console.log(`Updated addresses for ${chainId}`, addrs)
}

vanityDeploy()
