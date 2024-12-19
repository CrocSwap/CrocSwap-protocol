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
import { CrocAuctionAddrs } from '../../../types/addrs';
import { BigNumber } from 'ethers';

const abi = new AbiCoder()

async function vanityDeploy() {
    let { addrs, chainId, wallet: authority } = initChain()

    const futa = await inflateAddr("FutaLauncher", addrs.auction?.futa || "", authority,
        addrs.auction?.query, addrs.query, 420
    ) as FutaLauncher

    (addrs.auction as CrocAuctionAddrs).futa = futa.address

    console.log(`Updated addresses for ${chainId}`, addrs)

    await traceContractTx(futa.setAuctionDuration(10), "Set Auction Duration")
    await traceContractTx(futa.setAuctionSteps(10, 100), "Set Auction Steps")
    await traceContractTx(futa.setTokenSupply(BigNumber.from(10).pow(27).mul(69),
        BigNumber.from(10).pow(26).mul(138)), "Set Token Supply")
}

vanityDeploy()
