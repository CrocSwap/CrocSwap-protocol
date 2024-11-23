/* Deploys a FeeModulator contract and instructions for installing the policy
 * conduit through governance. */

import { ColdPath, CrocDeployer, CrocPolicy, CrocSwapDex, FeeModulatorConduit } from '../../../../typechain';
import { BOOT_PROXY_IDX, COLD_PROXY_IDX } from '../../../constants/addrs';
import { inflateAddr, initChain, refContract, traceContractTx, traceTxResp } from '../../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';
import { setConduit } from '../../../libs/governance';
import { ethers } from 'ethers';
import { ZERO_ADDR } from '../../inflate';

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

async function addUniversalModulator() {
    let { addrs, chainId, wallet: authority } = initChain()

    console.log(authority.address)
    const feeMod = await inflateAddr("FeeModulatorConduit", addrs.conduits.feeMod, 
        authority, addrs.policy, addrs.query) as FeeModulatorConduit

    traceTxResp(await feeMod.addUniversalModulator("0x051668b832d6F9437CFF4955Ae5A2bd68eBe5422", 
        { gasLimit: 100000 }), "Add Universal Modulator")
}

async function changeFee() {
    let { addrs, chainId, wallet: authority } = initChain()

    console.log(authority.address)
    const feeMod = await inflateAddr("FeeModulatorConduit", addrs.conduits.feeMod, 
        authority, addrs.policy, addrs.query) as FeeModulatorConduit

    traceTxResp(await feeMod.changeFeeUnivMod("0x0000000000000000000000000000000000000000", 
        "0xfae103dc9cf190ed75350761e95403b7b8afa6c0",
        420,  50,
        { gasLimit: 200000 }), "Change fee")
}

//addUniversalModulator()
changeFee()
