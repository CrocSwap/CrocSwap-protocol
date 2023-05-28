/* Creates the sidecar proxy contracts and periphery contracts. */

import { inflateAddr, initChain } from '../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';

const abi = new AbiCoder()

async function install() {
    let { addrs, chainId, wallet: authority } = initChain()

    addrs.hot = (await inflateAddr("ColdPath", addrs.cold, authority)).address
    console.log(addrs)

    addrs.hot = (await inflateAddr("HotPath", addrs.hot, authority)).address
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

    addrs.policy = (await inflateAddr("CrocPolicy", addrs.policy, authority)).address
    console.log(addrs)

    addrs.query = (await inflateAddr("CrocQuery", addrs.query, authority)).address
    console.log(addrs)

    addrs.impact = (await inflateAddr("CrocImpact", addrs.impact, authority)).address
    console.log(addrs)

}

install()
