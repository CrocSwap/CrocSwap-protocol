import { solidity } from "ethereum-waffle";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { Signer } from "ethers";
import { CrocSwapDex } from "../typechain";
import { AbiCoder } from "@ethersproject/abi";

export const BOOT_PROXY_IDX = 0;
export const SWAP_PROXY_IDX = 1;
export const LP_PROXY_IDX = 2;
export const COLD_PROXY_IDX = 3;
export const LONG_PROXY_IDX = 4;
export const MICRO_PROXY_IDX = 5;
export const KNOCKOUT_LP_PROXY_IDX = 7;
export const FLAG_CROSS_PROXY_IDX = 3500;
export const SAFE_MODE_PROXY_PATH = 9999;

export async function buildCrocSwapSex (auth: Promise<Signer>): Promise<CrocSwapDex> {
    const abi = new AbiCoder()

    let factory = await ethers.getContractFactory("CrocSwapDex")
    let dex = await factory.connect(await auth).deploy() as CrocSwapDex

    factory = await ethers.getContractFactory("ColdPath")
    let proxy = await factory.deploy()
    let cmd = abi.encode(["uint8", "address", "uint16"], [21, proxy.address, COLD_PROXY_IDX])
    await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true)

    factory = await ethers.getContractFactory("HotProxy")
    proxy = await factory.deploy()
    cmd = abi.encode(["uint8", "address", "uint16"], [21, proxy.address, SWAP_PROXY_IDX])
    await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true) 

    factory = await ethers.getContractFactory("WarmPath")
    proxy = await factory.deploy()
    cmd = abi.encode(["uint8", "address", "uint16"], [21, proxy.address, LP_PROXY_IDX])
    await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true) 

    factory = await ethers.getContractFactory("LongPath")
    proxy = await factory.deploy()
    cmd = abi.encode(["uint8", "address", "uint16"], [21, proxy.address, LONG_PROXY_IDX])
    await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true) 

    factory = await ethers.getContractFactory("MicroPaths")
    proxy = await factory.deploy()
    cmd = abi.encode(["uint8", "address", "uint16"], [21, proxy.address, MICRO_PROXY_IDX])
    await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true) 

    factory = await ethers.getContractFactory("KnockoutFlagPath")
    proxy = await factory.deploy()
    cmd = abi.encode(["uint8", "address", "uint16"], [21, proxy.address, FLAG_CROSS_PROXY_IDX])
    await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true) 

    factory = await ethers.getContractFactory("KnockoutLiqPath")
    proxy = await factory.deploy()
    cmd = abi.encode(["uint8", "address", "uint16"], [21, proxy.address, KNOCKOUT_LP_PROXY_IDX])
    await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true) 

    factory = await ethers.getContractFactory("SafeModePath")
    proxy = await factory.deploy()
    cmd = abi.encode(["uint8", "address", "uint16"], [21, proxy.address, SAFE_MODE_PROXY_PATH])
    await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true) 

    return dex
}
