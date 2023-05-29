
import { inflateAddr, initChain, refContract, traceContractTx, traceTxResp } from '../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';
import { CrocPolicy, ERC20, TimelockAccepts } from '../../../typechain';
import { BOOT_PROXY_IDX, LP_PROXY_IDX, TOKEN_ADDRS } from '../../constants/addrs';
import { BigNumber, BytesLike, ethers } from 'ethers';
import { MockERC20 } from '../../../contracts/typechain';
import { CrocProtocolCmd, INIT_TIMELOCK_DELAY, opsResolution, populateTimelockCalls, treasuryResolution } from '../../libs/governance';
import { initLiqCmd, poolStdTemplCmd } from '../../libs/pool';

const abi = new AbiCoder()

async function install() {
    let { addrs, poolParams } = initChain()

    let initCmd = initLiqCmd(poolParams)
    await opsResolution(addrs, initCmd, INIT_TIMELOCK_DELAY, "Set pool init liquidity")

    let templCmd = poolStdTemplCmd(poolParams)
    await opsResolution(addrs, templCmd, INIT_TIMELOCK_DELAY, "Set standard pool template")
}

install()
