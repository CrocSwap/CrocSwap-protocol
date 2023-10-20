
import { inflateAddr, initChain, initProvider, refContract, traceContractTx, traceTxResp } from '../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';
import { CrocPolicy, ERC20, TimelockAccepts } from '../../../typechain';
import { BOOT_PROXY_IDX, COLD_PROXY_IDX, LP_PROXY_IDX, TOKEN_ADDRS } from '../../constants/addrs';
import { BigNumber, BytesLike, ethers } from 'ethers';
import { MockERC20 } from '../../../contracts/typechain';
import { CrocProtocolCmd, INIT_TIMELOCK_DELAY, opsResolution, populateTimelockCalls, treasuryResolution } from '../../libs/governance';
import { initLiqCmd, poolStdTemplCmd } from '../../libs/pool';

const abi = new AbiCoder()

const txArgs = { gasLimit: 1000000}

// Used for testnet setups where governance isn't being put behind a timelock/multisig
async function install() {
    let { addrs, poolParams, } = initProvider()
    let { wallet: authority } = initChain()
    
    let policy = (await inflateAddr("CrocPolicy", addrs.policy, authority)) as CrocPolicy

    let initCmd = initLiqCmd(poolParams)
    await traceContractTx(policy.opsResolution(addrs.dex, initCmd.callpath, 
        initCmd.protocolCmd, txArgs), "Set pool init liquidity")

    let templCmd = poolStdTemplCmd(poolParams)
    await traceContractTx(policy.opsResolution(addrs.dex, templCmd.callpath, 
        templCmd.protocolCmd, txArgs), "Set pool template")
}

install()
