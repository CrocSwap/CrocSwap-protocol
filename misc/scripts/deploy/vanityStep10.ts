
import { inflateAddr, initChain, initProvider, refContract, traceContractTx, traceTxResp } from '../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';
import { CrocPolicy, ERC20, TimelockAccepts } from '../../../typechain';
import { BOOT_PROXY_IDX, LP_PROXY_IDX } from '../../constants/addrs';
import { BigNumber, BytesLike, ethers } from 'ethers';
import { MockERC20 } from '../../../contracts/typechain';
import { CrocProtocolCmd, INIT_TIMELOCK_DELAY, opsResolution, opsTimelockSet, populateTimelockCalls, treasuryResolution, treasuryTimelockSet } from '../../libs/governance';
import { initLiqCmd, poolStdTemplCmd } from '../../libs/pool';

const abi = new AbiCoder()

async function install() {
    let { addrs } = initProvider()

    const timeDelay = 2 * 24 * 3600 // Two days
    await opsTimelockSet(addrs, timeDelay, INIT_TIMELOCK_DELAY)
    await treasuryTimelockSet(addrs, timeDelay, INIT_TIMELOCK_DELAY)
    
}

install()
