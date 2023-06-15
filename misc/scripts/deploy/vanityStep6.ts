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

async function install() {
    let { addrs, chainId, wallet: authority } = initChain()

    const START_DELAY = 30;    

    addrs.govern.timelockTreasury = (await inflateAddr("TimelockAccepts", addrs.govern.timelockTreasury, authority,
        START_DELAY, [addrs.govern.multisigTreasury], [addrs.govern.multisigTreasury])).address
    console.log(addrs)

    addrs.govern.timelockOps = (await inflateAddr("TimelockAccepts", addrs.govern.timelockOps, authority,
        START_DELAY, [addrs.govern.multisigOps], [addrs.govern.multisigOps])).address
    console.log(addrs)

    addrs.govern.timelockEmergency = (await inflateAddr("TimelockAccepts", addrs.govern.timelockTreasury, authority,
        START_DELAY, [addrs.govern.multisigEmergency], [addrs.govern.multisigEmergency])).address
    console.log(addrs)
}

install()
