/* Installs the major sidecar proxy contracts to CrocSwapDex through CrocPolicy
 * calls. */

import { inflateAddr, initChain, refContract, traceContractTx, traceTxResp } from '../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';
import { CrocPolicy, ERC20, TimelockAccepts } from '../../../typechain';
import { BOOT_PROXY_IDX, LP_PROXY_IDX, TOKEN_ADDRS } from '../../constants/addrs';
import { BigNumber, BytesLike, ethers } from 'ethers';
import { MockERC20 } from '../../../contracts/typechain';
import { opsResolution, populateTimelockCalls } from '../../libs/governance';

const abi = new AbiCoder()
let cmd

const txArgs = { gasLimit: 1000000 }

async function install() {
    let { addrs, chainId, wallet: authority } = initChain()

    let policy = (await refContract("CrocPolicy", addrs.policy, authority)) as CrocPolicy
    await traceContractTx(policy.transferGovernance(addrs.govern.timelockOps, 
        addrs.govern.timelockTreasury, addrs.govern.timelockEmergency, txArgs),
        "Transfer CrocPolicy to Timelocks")
}

install()
