
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

    // Warm path may have already been pre-installed, but install again to verify that
    // treasury resolutions are correctly enabled
    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.warm, LP_PROXY_IDX])
    let resolution: CrocProtocolCmd = { 
        protocolCmd: cmd,
        callpath: BOOT_PROXY_IDX,
        sudo: true
    }

    treasuryResolution(addrs, resolution, 30, "Install Warm path sidecar")
}

install()
