/* Creates the sidecar proxy contracts and periphery contracts. */

import { inflateAddr, initChain } from '../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';

const abi = new AbiCoder()

async function install() {
    let { addrs, chainId, wallet: authority } = initChain()

    addrs.cold = (await inflateAddr("ColdPath", addrs.cold, authority)).address
    console.log(addrs)

    addrs.hot = (await inflateAddr("HotProxy", addrs.hot, authority)).address
    console.log(addrs)

    addrs.knockout = (await inflateAddr("KnockoutLiqPath", addrs.knockout, authority)).address
    console.log(addrs)

    addrs.koCross = (await inflateAddr("KnockoutFlagPath", addrs.koCross, authority)).address
    console.log(addrs)

    addrs.long = (await inflateAddr("LongPath", addrs.long, authority)).address
    console.log(addrs)

    addrs.micro = (await inflateAddr("MicroPaths", addrs.micro, authority)).address
    console.log(addrs)

    addrs.warm = (await inflateAddr("WarmPath", addrs.warm, authority)).address
    console.log(addrs)

    addrs.blast = (await inflateAddr("BlastPath", addrs.blast || "", authority)).address
    console.log(addrs)

    addrs.policy = (await inflateAddr("CrocPolicy", addrs.policy, authority, addrs.dex)).address
    console.log(addrs)

    addrs.query = (await inflateAddr("CrocQuery", addrs.query, authority, addrs.dex)).address
    console.log(addrs)

    addrs.impact = (await inflateAddr("CrocImpact", addrs.impact, authority, addrs.dex)).address
    console.log(addrs)

    addrs.swapRouter = (await inflateAddr("CrocSwapRouter", addrs.swapRouter || "", authority, addrs.dex)).address
    console.log(addrs)

    addrs.swapBypass = (await inflateAddr("CrocSwapRouterBypass", addrs.swapBypass || "", authority, addrs.dex)).address
    console.log(addrs)
}

install()
