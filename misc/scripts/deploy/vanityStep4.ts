/* Creates the sidecar proxy contracts and periphery contracts. */

import { ColdPath, CrocDeployer, CrocPolicy, CrocSwapDex } from '../../../typechain';
import { BOOT_PROXY_IDX, COLD_PROXY_IDX } from '../../constants/addrs';
import { inflateAddr, initChain, refContract, traceContractTx, traceTxResp } from '../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';

const abi = new AbiCoder()

async function install() {
    let { addrs, chainId, wallet: authority } = initChain()

    addrs.hot = (await inflateAddr("ColdPath", addrs.cold, authority)).address
    console.log(addrs)

    addrs.hot = (await inflateAddr("HotPath", addrs.cold, authority)).address
    console.log(addrs)

    addrs.knockout = (await inflateAddr("KnockoutLiqPath", addrs.cold, authority)).address
    console.log(addrs)

    addrs.koCross = (await inflateAddr("KnockoutFlagPath", addrs.cold, authority)).address
    console.log(addrs)

    addrs.long = (await inflateAddr("LongPath", addrs.cold, authority)).address
    console.log(addrs)

    addrs.micro = (await inflateAddr("MicroPaths", addrs.cold, authority)).address
    console.log(addrs)

    addrs.warm = (await inflateAddr("WarmPath", addrs.cold, authority)).address
    console.log(addrs)

    addrs.policy = (await inflateAddr("CrocPolicy", addrs.cold, authority)).address
    console.log(addrs)

    addrs.query = (await inflateAddr("CrocQuery", addrs.cold, authority)).address
    console.log(addrs)

    addrs.impact = (await inflateAddr("CrocImpact", addrs.cold, authority)).address
    console.log(addrs)

}

install()
