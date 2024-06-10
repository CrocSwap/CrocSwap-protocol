import { ethers } from "hardhat";
import {
    CrocSwapDex,
    ColdPath,
    WarmPath,
    LongPath,
    MicroPaths,
    CrocPolicy,
    CrocQuery,
    CrocShell,
    HotPath,
    CrocImpact,
    KnockoutFlagPath,
    KnockoutLiqPath,
    MultiPath,
    WBERA
} from "../../typechain";

interface CrocAddrs {
    dex: string | undefined;
    cold: string | undefined;
    warm: string | undefined;
    long: string | undefined;
    micro: string | undefined;
    multi: string | undefined;
    hot: string | undefined;
    knockout: string | undefined;
    koCross: string | undefined;
    policy: string | undefined;
    query: string | undefined;
    impact: string | undefined;
    shell: string | undefined;
    multiswap: string | undefined;
    wbera: string | undefined;
}

const addrs: CrocAddrs = {
    dex: undefined,
    cold: undefined,
    warm: undefined,
    long: undefined,
    micro: undefined,
    multi: undefined,
    hot: undefined,
    knockout: undefined,
    koCross: undefined,
    policy: undefined,
    query: undefined,
    impact: undefined,
    shell: undefined,
    multiswap: undefined,
    wbera: "0x7507c1dc16935B82698e4C63f2746A2fCf994dF8",
};

const BOOT_PROXY_IDX = 0;
const SWAP_PROXY_IDX = 1;
const LP_PROXY_IDX = 128;
const COLD_PROXY_IDX = 3;
const LONG_PROXY_IDX = 130;
const MICRO_PROXY_IDX = 131;
const MULTICALL_PROXY_IDX = 6;
const KNOCKOUT_LP_PROXY_IDX = 7;
const FLAG_CROSS_PROXY_IDX = 3500;
const SAFE_MODE_PROXY_PATH = 9999;

const abi = new ethers.utils.AbiCoder();
const override = { gasLimit: 6000000 };

async function createDexContracts(): Promise<CrocSwapDex> {
    let factory;

    factory = await ethers.getContractFactory("WBERA")
    const wbera = addrs.wbera ? factory.attach(addrs.wbera) : ((await factory.deploy(override)) as WBERA);
    addrs.wbera = wbera.address;

    factory = await ethers.getContractFactory("WarmPath");
    const warmPath = addrs.warm ? factory.attach(addrs.warm) : ((await factory.deploy(addrs.wbera, override)) as WarmPath);
    addrs.warm = warmPath.address;

    factory = await ethers.getContractFactory("LongPath");
    const longPath = addrs.long ? factory.attach(addrs.long) : ((await factory.deploy(addrs.wbera, override)) as LongPath);
    addrs.long = longPath.address;

    factory = await ethers.getContractFactory("MicroPaths");
    const microPath = addrs.micro ? factory.attach(addrs.micro) : ((await factory.deploy(override)) as MicroPaths);
    addrs.micro = microPath.address;

    factory = await ethers.getContractFactory("MultiPath");
    const multiPath = addrs.multi ? factory.attach(addrs.multi) : ((await factory.deploy(override)) as MultiPath);
    addrs.multi = multiPath.address;

    factory = await ethers.getContractFactory("ColdPath");
    const coldPath = addrs.cold ? factory.attach(addrs.cold) : ((await factory.deploy(addrs.wbera, override)) as ColdPath);
    addrs.cold = coldPath.address;

    factory = await ethers.getContractFactory("HotProxy");
    const hotPath = addrs.hot ? factory.attach(addrs.hot) : ((await factory.deploy(addrs.wbera, override)) as HotPath);
    addrs.hot = hotPath.address;

    factory = await ethers.getContractFactory("KnockoutLiqPath");
    const knockoutPath = addrs.knockout
        ? factory.attach(addrs.knockout)
        : ((await factory.deploy(addrs.wbera, override)) as KnockoutLiqPath);
    addrs.knockout = knockoutPath.address;

    factory = await ethers.getContractFactory("KnockoutFlagPath");
    const crossPath = addrs.koCross
        ? factory.attach(addrs.koCross)
        : ((await factory.deploy(override)) as KnockoutFlagPath);
    addrs.koCross = crossPath.address;

    factory = await ethers.getContractFactory("CrocSwapDex");
    const dex = (addrs.dex ? factory.attach(addrs.dex) : await factory.deploy(addrs.wbera, override)) as CrocSwapDex;
    addrs.dex = dex.address;

    console.log(addrs);
    return dex;
}

async function createPeripheryContracts(dexAddr: string): Promise<CrocPolicy> {
    let factory;

    factory = await ethers.getContractFactory("CrocPolicy");
    const policy = (addrs.policy ? factory.attach(addrs.policy) : await factory.deploy(dexAddr, override)) as CrocPolicy;
    addrs.policy = policy.address;

    factory = await ethers.getContractFactory("CrocQuery");
    const query = (addrs.query ? factory.attach(addrs.query) : await factory.deploy(dexAddr, override)) as CrocQuery;
    addrs.query = query.address;

    factory = await ethers.getContractFactory("CrocImpact");
    const impact = (addrs.impact ? factory.attach(addrs.impact) : await factory.deploy(dexAddr, override)) as CrocImpact;
    addrs.impact = impact.address;

    factory = await ethers.getContractFactory("CrocShell");
    const shell = (addrs.shell ? factory.attach(addrs.shell) : await factory.deploy(override)) as CrocShell;
    addrs.shell = shell.address;

    factory = await ethers.getContractFactory("BeraCrocMultiSwap");
    const multiswap = (addrs.multiswap ? factory.attach(addrs.multiswap) : await factory.deploy(addrs.dex, addrs.impact, addrs.query)) as CrocShell;
    addrs.multiswap = multiswap.address;


    console.log(addrs);
    return policy;
}

async function installPolicy(dex: CrocSwapDex) {
    console.log("Installing Policy...");
    const authCmd = abi.encode(["uint8", "address"], [20, addrs.policy]);
    const tx = await dex.protocolCmd(COLD_PROXY_IDX, authCmd, true, override);
    await tx.wait();
    console.log("Policy installed.");
}

async function installSidecars(dex: CrocSwapDex) {
    const abi = new ethers.utils.AbiCoder();
    let tx;
    let cmd;

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.cold, COLD_PROXY_IDX]);
    console.log("Installing Cold Path...");
    tx = await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);
    await tx.wait();
    console.log("Cold Path installed.");

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.warm, LP_PROXY_IDX]);
    console.log("Installing LP Path...");
    tx = await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);
    await tx.wait();
    console.log("LP Path installed.");

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.hot, SWAP_PROXY_IDX]);
    console.log("Installing Swap Path...");
    tx = await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);
    await tx.wait();
    console.log("Swap Path installed.");

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.long, LONG_PROXY_IDX]);
    console.log("Installing Long Path...");
    tx = await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);
    await tx.wait();
    console.log("Long Path installed.");

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.micro, MICRO_PROXY_IDX]);
    console.log("Installing Micro Path...");
    tx = await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);
    await tx.wait();
    console.log("Micro Path installed.");

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.multi, MULTICALL_PROXY_IDX]);
    console.log("Installing Multicall Path...");
    tx = await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);
    await tx.wait();
    console.log("Multicall Path installed.");

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.knockout, KNOCKOUT_LP_PROXY_IDX]);
    console.log("Installing Knockout LP Path...");
    tx = await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);
    await tx.wait();
    console.log("Knockout LP Path installed.");

    cmd = abi.encode(["uint8", "address", "uint16"], [21, addrs.koCross, FLAG_CROSS_PROXY_IDX]);
    console.log("Installing Knockout Cross Path...");
    tx = await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);
    await tx.wait();
    console.log("Knockout Cross Path installed.");
}


async function initPoolTemplate(policy: CrocPolicy) {
    const POOL_IDX1 = 36000;
    const FEE_BPS1 = 5;

    const POOL_IDX2 = 36001;
    const FEE_BPS2 = 30;

    const POOL_IDX3 = 36002;
    const FEE_BPS3 = 100;

    const POOL_INIT_LIQ = 10000;

    const TICK_SIZE = 16;
    const JIT_THRESH = 3;

    const KNOCKOUT_ON_FLAG = 32;
    const KNOCKOUT_TICKS_FLAG = 4; // 16 ticks
    const knockoutFlag = KNOCKOUT_ON_FLAG + KNOCKOUT_TICKS_FLAG;

    if (addrs.dex) {
        console.log("Installing Treasury Resolution...");

        const setPoolLiqCmd = abi.encode(["uint8", "uint128"], [112, POOL_INIT_LIQ]);
        let tx = await policy.treasuryResolution(addrs.dex, COLD_PROXY_IDX, setPoolLiqCmd, false, override);
        await tx.wait();
        
        console.log("Treasury Resolution installed.");

        console.log("Installing Ops Resolution...");
        let templateCmd = abi.encode(
            ["uint8", "uint256", "uint16", "uint16", "uint8", "uint8", "uint8"],
            [110, POOL_IDX1, FEE_BPS1 * 100, TICK_SIZE, JIT_THRESH, knockoutFlag, 0],
        );
        tx = await policy.opsResolution(addrs.dex, COLD_PROXY_IDX, templateCmd, override);

        templateCmd = abi.encode(
            ["uint8", "uint256", "uint16", "uint16", "uint8", "uint8", "uint8"],
            [110, POOL_IDX2, FEE_BPS2 * 100, TICK_SIZE, JIT_THRESH, knockoutFlag, 0],
        );
        tx = await policy.opsResolution(addrs.dex, COLD_PROXY_IDX, templateCmd, override);

        templateCmd = abi.encode(
            ["uint8", "uint256", "uint16", "uint16", "uint8", "uint8", "uint8"],
            [110, POOL_IDX3, FEE_BPS3 * 100, TICK_SIZE, JIT_THRESH, knockoutFlag, 0],
        );
        tx = await policy.opsResolution(addrs.dex, COLD_PROXY_IDX, templateCmd, override);

        await tx.wait();

        console.log("Ops Resolution installed.");
        return
    }
}

async function deploy() {
    const authority = (await ethers.getSigners())[0];

    console.log("Deploying with the following addresses...");
    console.log("Protocol Authority: ", await authority.address);

    const dex = await createDexContracts();
    const policy = await createPeripheryContracts(dex.address);

    await installSidecars(dex);
    await installPolicy(dex);

    await initPoolTemplate(policy);

    return
}

deploy();
