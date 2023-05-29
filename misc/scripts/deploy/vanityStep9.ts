
import { inflateAddr, initChain, refContract, traceContractTx, traceTxResp } from '../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';
import { CrocPolicy, ERC20, TimelockAccepts } from '../../../typechain';
import { BOOT_PROXY_IDX, LP_PROXY_IDX, TOKEN_ADDRS } from '../../constants/addrs';
import { BigNumber, BytesLike, ethers } from 'ethers';
import { MockERC20 } from '../../../contracts/typechain';
import { CrocProtocolCmd, opsResolution, populateTimelockCalls, treasuryResolution } from '../../libs/governance';

const abi = new AbiCoder()
let cmd

async function install() {
    let { addrs } = initChain()

    // Enable pool type
    /*cmd = 
    let resolution: CrocProtocolCmd = { 
        protocolCmd: cmd,
        callpath: BOOT_PROXY_IDX,
        sudo: true
    }

    opsResolution(addrs, resolution, 30)*/
}

install()
