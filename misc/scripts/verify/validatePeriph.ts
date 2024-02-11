/* Creates the sidecar proxy contracts and periphery contracts. */

import { initProvider, validateDeploy } from '../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';

let { addrs, provider: provider } = initProvider()

async function validate() {
    console.log("Validating Peripheral Contracts...")
    validateDeploy(addrs.impact, "CrocImpact", provider, addrs.dex)
    validateDeploy(addrs.query, "CrocQuery", provider, addrs.dex)
}

validate()
