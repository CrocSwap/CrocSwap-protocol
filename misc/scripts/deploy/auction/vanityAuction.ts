/* Workflow to deploy a basic CrocSwapDex contract using a pre-determined
 * create2 vanity salt, then hand off to the CrocPolicy contract. 
 *
 * Call using:
 * npx hardhat run 
 * 
 * Make sure vanity steps from the general purpose deploy is called first
 */

import { AbiCoder } from '@ethersproject/abi';
import { AuctionPath, ColdPath, CrocAuctionQuery, CrocDeployer, CrocPolicy, CrocQuery, CrocSwapDex } from '../../../../typechain';
import { AUCTION_PROXY_IDX, BOOT_PROXY_IDX, COLD_PROXY_IDX } from '../../../constants/addrs';
import { inflateAddr, initChain, refContract, traceContractTx, traceTxResp } from '../../../libs/chain';

const abi = new AbiCoder()

async function vanityDeploy() {
    let { addrs, chainId, wallet: authority } = initChain()

    const crocDeployer = await refContract("CrocDeployer", addrs.deployer, 
        authority) as CrocDeployer

    const auctionPath = await inflateAddr("AuctionPath", addrs.auction?.auctionPath || "", authority) as AuctionPath
    const auctionDex = await inflateAddr("CrocSwapDex", addrs.auction?.dex || "", authority) as CrocSwapDex
    const auctionQuery = await inflateAddr("CrocAuctionQuery", addrs.auction?.query || "", 
        authority, auctionDex.address) as CrocAuctionQuery

    addrs.auction = {
        dex: auctionDex.address,
        query: auctionQuery.address,
        auctionPath: auctionPath.address,
    }

    console.log(`Updated addresses for ${chainId}`, addrs)

    let cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.cold, COLD_PROXY_IDX])
    await traceContractTx(auctionDex.protocolCmd(BOOT_PROXY_IDX, cmd, true, {"gasLimit": 1000000}), 
        "Cold Path Install")

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.auction.auctionPath, AUCTION_PROXY_IDX])
    await traceContractTx(auctionDex.protocolCmd(BOOT_PROXY_IDX, cmd, true, {"gasLimit": 1000000}), 
        "Auction Path Install")

    console.log(`Updated addresses for ${chainId}`, addrs)
}

vanityDeploy()
