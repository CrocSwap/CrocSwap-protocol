/* Deploys a FeeModulator contract and instructions for installing the policy
 * conduit through governance. */

import { ColdPath, CrocDeployer, CrocPolicy, CrocSwapDex, FeeModulatorConduit } from '../../../../typechain';
import { BOOT_PROXY_IDX, COLD_PROXY_IDX } from '../../../constants/addrs';
import { inflateAddr, initChain, refContract, traceContractTx, traceTxResp } from '../../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';
import { setConduit } from '../../../libs/governance';

const abi = new AbiCoder()

async function vanityDeploy() {
    let { addrs, chainId, wallet: authority } = initChain()

    const crocDeployer = await refContract("CrocDeployer", addrs.deployer, 
        authority) as CrocDeployer

    const feeMod = await inflateAddr("FeeModulatorConduit", addrs.conduits.feeMod, 
        authority, addrs.policy, addrs.query) as FeeModulatorConduit

    addrs.conduits.feeMod = feeMod.address

    console.log("CrocSwapDex deployed at: ", addrs.dex)
    console.log(`Updated addresses for ${chainId}`, addrs)

    // Install cold path proxy, so we can transfer ownership
    const REVISE_POOL_CMD = 111
    await setConduit(addrs, { 
        conduit: addrs.conduits.feeMod,
        proxyPath: COLD_PROXY_IDX,
        flagPosition: REVISE_POOL_CMD,
        expireTtl: 3600*24*365,
        mandateTtl: 3600*24*5,
    }, 3600*48, "Set FeeModulatorConduit")
}

vanityDeploy()
