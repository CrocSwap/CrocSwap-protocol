
import { inflateAddr, initChain, initProvider, refContract, traceContractTx, traceTxResp } from '../../libs/chain';
import { AbiCoder } from '@ethersproject/abi';
import { CrocPolicy, CrocSwapDex, ERC20, TimelockAccepts } from '../../../typechain';
import { BOOT_PROXY_IDX, COLD_PROXY_IDX, LP_PROXY_IDX, TOKEN_ADDRS } from '../../constants/addrs';
import { BigNumber, BytesLike, ethers } from 'ethers';
import { MockERC20 } from '../../../contracts/typechain';
import { CrocProtocolCmd, INIT_TIMELOCK_DELAY, opsResolution, populateTimelockCalls, treasuryResolution } from '../../libs/governance';
import { blastConfigPointsMainnet, blastConfigPointsTestnet, blastConfigUsdbMainnet, blastConfigUsdbTestnet, blastConfigYieldMainnetCmd, blastConfigYieldTestnetCmd, initLiqCmd, poolStdTemplCmd } from '../../libs/pool';

const abi = new AbiCoder()

const txArgs = { gasLimit: 1000000}

// Used for testnet setups where governance isn't being put behind a timelock/multisig
async function install() {
    let { addrs, poolParams } = initProvider()
    let { wallet: authority, chainId: chainId } = initChain()
    
    let policy = (await inflateAddr("CrocPolicy", addrs.policy, authority)) as CrocPolicy
    let dex = (await inflateAddr("CrocSwapDex", addrs.dex, authority)) as CrocSwapDex

    /*let initCmd = initLiqCmd(poolParams)
    await traceContractTx(policy.opsResolution(addrs.dex, initCmd.callpath, 
        initCmd.protocolCmd, txArgs), "Set pool init liquidity")

    let templCmd = poolStdTemplCmd(poolParams)
    await traceContractTx(policy.opsResolution(addrs.dex, templCmd.callpath, 
        templCmd.protocolCmd, txArgs), "Set pool template")

    if (chainId === "0xa0c71fd") {
        let yieldCmd = blastConfigYieldTestnetCmd()
        await traceContractTx(dex.userCmd(yieldCmd.callpath, yieldCmd.userCmd),  "Set yield config")

        let usdbCmd = blastConfigUsdbTestnet()
        await traceContractTx(dex.userCmd(usdbCmd.callpath, usdbCmd.userCmd),  "Set usdb yield config")

        let pointsCmd = blastConfigPointsTestnet(authority.address)
        await traceContractTx(policy.treasuryResolution(addrs.dex, pointsCmd.callpath, pointsCmd.protocolCmd, true),
            "Set points config")
    }*/

    if (chainId === "0x13e31") {
        /*let yieldCmd = blastConfigYieldMainnetCmd()
        await traceContractTx(dex.userCmd(yieldCmd.callpath, yieldCmd.userCmd),  "Set yield config")

        let usdbCmd = blastConfigUsdbMainnet()
        await traceContractTx(dex.userCmd(usdbCmd.callpath, usdbCmd.userCmd),  "Set usdb yield config")*/

        let pointsCmd = blastConfigPointsTestnet(authority.address)
        await traceContractTx(policy.treasuryResolution(addrs.dex, pointsCmd.callpath, pointsCmd.protocolCmd, true),
            "Set points config")
    }
}

install()
