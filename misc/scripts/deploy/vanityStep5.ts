/* Installs the major sidecar proxy contracts to CrocSwapDex through CrocPolicy
 * calls. */

import { ColdPath, CrocDeployer, CrocPolicy, CrocSwapDex } from '../../../typechain';
import { FLAG_CROSS_PROXY_IDX, KNOCKOUT_LP_PROXY_IDX, LONG_PROXY_IDX, LP_PROXY_IDX, MICRO_PROXY_IDX, SWAP_PROXY_IDX } from '../../constants/addrs';
import { inflateAddr, initChain, refContract, traceContractTx, traceTxResp } from '../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';

const abi = new AbiCoder()
let cmd

async function install() {
    let { addrs, chainId, wallet: authority } = initChain()

    let policy = (await inflateAddr("CrocPolicy", addrs.cold, authority)) as CrocPolicy

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.long, LONG_PROXY_IDX])
    await traceContractTx(policy.treasuryResolution(
        addrs.dex, 0, cmd, true), "Install long path")

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.warm, LP_PROXY_IDX])
    await traceContractTx(policy.treasuryResolution(
        addrs.dex, 0, cmd, true), "Install warm path")

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.hot, SWAP_PROXY_IDX])
    await traceContractTx(policy.treasuryResolution(
        addrs.dex, 0, cmd, true), "Install hot proxy path")

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.micro, MICRO_PROXY_IDX])
    await traceContractTx(policy.treasuryResolution(
        addrs.dex, 0, cmd, true), "Install hot proxy path")

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.knockout, KNOCKOUT_LP_PROXY_IDX])
    await traceContractTx(policy.treasuryResolution(
        addrs.dex, 0, cmd, true), "Install knockout liquidity proxy path")

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.koCross, FLAG_CROSS_PROXY_IDX])
    await traceContractTx(policy.treasuryResolution(
        addrs.dex, 0, cmd, true), "Install knockout liquidity proxy path")
}

install()
