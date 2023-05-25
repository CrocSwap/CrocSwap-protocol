/* Workflow to deploy a basic CrocSwapDex contract using a pre-determined
 * create2 vanity salt, then hand off to the CrocPolicy contract. 
 *
 * Call using:
 * npx hardhat run 
 */

import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { ColdPath, CrocDeployer, CrocPolicy, CrocSwapDex } from '../../../typechain';
import { CREATE2_SALTS } from '../../constants/salts';

let override = { gasPrice: BigNumber.from("10").pow(9).mul(2), gasLimit: 6000000 }

const CHAIN_ID = '0x1';

const salt = CREATE2_SALTS[CHAIN_ID]['']

let abi = new ethers.utils.AbiCoder()

async function vanityDeploy() {
    let authority = (await ethers.getSigners())[0]

    let cmd;
    let factory
    let tx;

    console.log("Deploying with the following addresses...")
    console.log("Protocol Authority: ", authority.address)

    factory = await ethers.getContractFactory("CrocDeployer")
    let crocDeployer = addrs.deployer ?
        await factory.attach(addrs.deployer) as CrocDeployer :
        await factory.deploy(authority.address, override) as CrocDeployer

    console.log("Deployer: ", crocDeployer.address)

    factory = await ethers.getContractFactory("CrocSwapDex")
    factory.bytecode

    await (await crocDeployer.deploy(factory.bytecode, SALT)).wait();

    const dex = await crocDeployer.dex_();
    console.log("CrocSwapDex deployed at: ", dex)

    const crocSwap = factory.attach(dex) as CrocSwapDex

    factory = await ethers.getContractFactory("ColdPath")
    let coldPath = addrs.cold ? factory.attach(addrs.cold) :
        await factory.deploy({gasPrice: ethers.provider.getGasPrice()}) as ColdPath
    addrs.cold = coldPath.address

    factory = await ethers.getContractFactory("CrocPolicy")
    let policy = (addrs.policy ? factory.attach(addrs.policy) :
        await factory.deploy(dex, { gasPrice: ethers.provider.getGasPrice()})) as CrocPolicy
    addrs.policy = policy.address

    console.log(addrs)

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.cold, COLD_PROXY_IDX])
    tx = await crocDeployer.protocolCmd(dex, BOOT_PROXY_IDX, cmd, true, {gasPrice: ethers.provider.getGasPrice()})
    await tx

    cmd = abi.encode(["uint8", "address"], [20, policy.address])
    tx = await crocDeployer.protocolCmd(dex, COLD_PROXY_IDX, cmd, true, {gasPrice: ethers.provider.getGasPrice()});
    await tx.wait()

    console.log(await crocSwap.readSlot(65537))
}

vanityDeploy()
