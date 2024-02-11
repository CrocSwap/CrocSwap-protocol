/* Creates the sidecar proxy contracts and periphery contracts. */

import { initProvider, validateDeploy } from '../libs/chain';

let { addrs, provider: provider } = initProvider()

async function validate() {
    console.log('------------------------------------------------------------------')

    console.log("Validating Core Contracts...")
    let pending = [
    validateDeploy(addrs.cold, "ColdPath", provider),
    validateDeploy(addrs.hot, "HotProxy", provider),
    validateDeploy(addrs.long, "LongPath", provider),
    validateDeploy(addrs.micro, "MicroPaths", provider),
    validateDeploy(addrs.warm, "WarmPath", provider),
    validateDeploy(addrs.knockout, "KnockoutLiqPath", provider),
    validateDeploy(addrs.koCross, "KnockoutFlagPath", provider),
    validateDeploy(addrs.dex, "CrocSwapDex", provider),
    validateDeploy(addrs.policy, "CrocPolicy", provider, addrs.dex)]
    await Promise.all(pending)
    console.log()

    console.log("Validating Peripheral Contracts...")
    pending = [
    validateDeploy(addrs.impact, "CrocImpact", provider, addrs.dex),
    validateDeploy(addrs.query, "CrocQuery", provider, addrs.dex)]
    await Promise.all(pending)
    console.log()
}

validate()
