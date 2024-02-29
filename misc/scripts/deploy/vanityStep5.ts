/* Installs the major sidecar proxy contracts to CrocSwapDex through CrocPolicy
 * calls. */

import { BLAST_PROXY_PATH } from '../../../test/SetupDex';
import { ColdPath, CrocPolicy, CrocSwapDex } from '../../../typechain';
import { BOOT_PROXY_IDX, FLAG_CROSS_PROXY_IDX, KNOCKOUT_LP_PROXY_IDX, LONG_PROXY_IDX, LP_PROXY_IDX, MICRO_PROXY_IDX, SWAP_PROXY_IDX } from '../../constants/addrs';
import { inflateAddr, initChain, refContract, traceContractTx, traceTxResp } from '../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';

const abi = new AbiCoder()
let cmd

const txArgs = { gasLimit: 1000000}

async function install() {
    let { addrs, chainId, wallet: authority } = initChain()

    let policy = (await inflateAddr("CrocPolicy", addrs.policy, authority)) as CrocPolicy

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.long, LONG_PROXY_IDX])
    await traceContractTx(policy.treasuryResolution(
        addrs.dex, BOOT_PROXY_IDX, cmd, true, txArgs), "Install long path")

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.warm, LP_PROXY_IDX])
    await traceContractTx(policy.treasuryResolution(
        addrs.dex, BOOT_PROXY_IDX, cmd, true, txArgs), "Install warm path")

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.hot, SWAP_PROXY_IDX])
    await traceContractTx(policy.treasuryResolution(
        addrs.dex, BOOT_PROXY_IDX, cmd, true, txArgs), "Install hot proxy path")

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.micro, MICRO_PROXY_IDX])
    await traceContractTx(policy.treasuryResolution(
        addrs.dex, BOOT_PROXY_IDX, cmd, true, txArgs), "Install micro paths")

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.knockout, KNOCKOUT_LP_PROXY_IDX])
    await traceContractTx(policy.treasuryResolution(
        addrs.dex, BOOT_PROXY_IDX, cmd, true, txArgs), "Install knockout liquidity proxy path")

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.koCross, FLAG_CROSS_PROXY_IDX])
    await traceContractTx(policy.treasuryResolution(
        addrs.dex, BOOT_PROXY_IDX, cmd, true, txArgs), "Install knockout cross proxy path")

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.blast, BLAST_PROXY_PATH])
    await traceContractTx(policy.treasuryResolution(
        addrs.dex, BOOT_PROXY_IDX, cmd, true, txArgs), "Install blast proxy path")
}

install()
