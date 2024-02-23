import {ethers} from "hardhat";
import {ZERO_ADDR} from "../../test/FixedPoint";
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
    BeraCrocMultiSwap,
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

/* Ropsten */
/*let addrs = {
    dex: "0x129bcaa67e211bfaf5f2d070405f3437282b5661",
    cold: "0x965a77f99d6aab400d5d13bccf47c63d192b3fa8",
    warm: "0x40ec968eEB324963127D86A5821FDa3379578301",
    long: "0x15ccfd33faba9651adc3ca779ab2fd6debda76a0",
    micro: "0xf9d00826c2692f379862ab8dfb06e14a6fd1f8ee",
    hot: "0x2975F2849B37a401f526a363e410B930c82A4f3d",
    policy: "0x8dce7b4583d1777671b3db2c80370e8053d4a90a",
    query: "0xc6768b1fb34035af90c0c994baced9ad86671a8c",
    shell: "0x2ee92b38056c28360467880bfa33c78cdbd1cab6"
}*/

// Kovan
/*let addrs = {
    dex: "0x5d42d6046927dee12b9b4a235be0cecd55d0e0fb",
    cold: "0x141e224f461a85006b2ef051a7c1c290e449202a",
    warm: "0x01B180D35125D31B4057d9ac7F46687dA1cAEFab",
    long: "0x66d34e1486d0bad1a8ced5a8505a73d0cfd41a0a",
    micro: "0x323172539b1b0d9eddffbd0318c4d6ab45292843",
    hot: "0x6291aa5812ff75412cf3f3258447139653a9a209",
    policy: "0xdcb3b5ec9170bef68e9fff21f0edd622f72f1899",
    query: "0x3a6e9cff691a473d4d0742e1dfc8ea263a99f6d0",
    shell: "0xf19D3dcdF82af0d40Cb3b4AaE4D266c638A3E454"
}*/

// Goerli
/*let addrs = {
    dex: "0xfafcd1f5530827e7398b6d3c509f450b1b24a209",
    cold: "0xb2ae163293c82dcf36b0ce704591edc2f9e2608d",
    warm: "0x01B180D35125D31B4057d9ac7F46687dA1cAEFab",
    long: "0x66d34e1486d0bad1a8ced5a8505a73d0cfd41a0a",
    micro: "0x323172539b1b0d9eddffbd0318c4d6ab45292843",
    hot: "0x141e224f461a85006b2ef051a7c1c290e449202a",
    knockout: "0x806859d4C974F9dCBB5f77e027062a02fC965987",
    koCross: "0xa7b87362b5b86f696a8027b409c20dba094744e2",
    policy: "0xaa391ee82f0c6b406e98ccd76d637cac2f712228",
    query: "0x93a4baFDd49dB0e06f3F3f9FddC1A67792F47518", 
    impact: "0x142BE02F2A3A27ecD6e2f18a43c2C234F372C831",
    shell: "0xdf2a97ae85e8ce33ad20ad2d3960fd92e8079861"
}*/

// Arbitrum Goerli
/*let addrs = {
    dex: '0x9EA4B2f9b1572eD3aC46b402d9Ba9153821033C6',
    cold: '0xb2aE163293C82DCF36b0cE704591eDC2f9E2608D',
    warm: '0x01B180D35125D31B4057d9ac7F46687dA1cAEFab',
    long: '0x66D34E1486d0bAd1A8ceD5a8505a73d0CFD41a0A',
    micro: '0x323172539B1B0D9eDDFFBd0318C4d6Ab45292843',
    hot: '0x141E224f461a85006b2EF051a7C1c290E449202A',
    knockout: '0xfAfcD1f5530827e7398B6D3C509f450b1b24a209',
    koCross: '0xAA391eE82F0C6b406E98cCd76d637CaC2f712228',
    policy: '0xDf2a97aE85e8Ce33ad20Ad2D3960fD92E8079861',
    query: '0x6291Aa5812FF75412Cf3F3258447139653A9a209',
    impact: '0x5afc7599A4b659C5c628fBC212012B68F3b5D41C',
    shell: '0x157EcDcCE75f24635cEB7FF9F2ac9BFf3ebF9733'
  }*/

// Mumbai
/*let addrs: CrocAddrs = {
    dex: '0x0bE8385D8CDDE8FACb54cF52FEd856D6C37Bb8e3',
    cold: '0x8e5a7ca8D9Ef7f9F6bedabCf9c21c539D6074bD4',
    warm: '0xbCb14ced50469E9F6B5E23527E7cdE0d96f2f0cf',
    long: '0x8D8Fd9A5CDF3b7238223E17e4e4c66D4500a13C6',
    micro: '0xd40CBB866A7f0b1e36132a86DDfe1a8bA8492286',
    hot: '0x6c53969F9273560F393a8BcbFA40906E7B51b1B2',
    knockout: '0x66B5b7f1F5604FC33aF247D59a7938369B37358F',
    koCross: '0x0C4BA0D85b6a93ae8746dBE4Bd1E9499D8e61999',
    policy: '0xCb0403d581C2BB794F5734D9c63bE31Bf18892c3',
    query: '0x6E6e2526cE1951576F452053Df1C5D11336738de',
    impact: '0x4d054Cb42B2AC113FFe542da7CE4A64Cf570898D',
    shell: '0x57f8908f340D522ca8B6E2E89d31b4eEF9B1779B'
  }*/

// Fuji
// const addrs: CrocAddrs = {
//   dex: undefined,
//   cold: undefined,
//   warm: undefined,
//   long: undefined,
//   micro: undefined,
//   multi: undefined,
//   hot: undefined,
//   knockout: undefined,
//   koCross: undefined,
//   policy: undefined,
//   query: undefined,
//   impact: undefined,
//   shell: undefined,
//   multiswap: undefined,
//   wbera: '0x459C653FaAE6E13b59cf8E005F5f709C7b2c2EB4',
// };

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
    wbera: "0x5eB2ef04616cf2d2aC7Ba7F6B084bD9aF160A9f3",
  };

// // Berachain-Artio
// let addrs: CrocAddrs = {
//     dex: "0xD2e387D096275f84C574600913C4eD313f6Cf8db",
//     cold: "0x711ae0AE98938EA285ABd98Df7BeF2eF2250C622",
//     warm: "0x697277B0F681ca67ef3cEFae2021aD3151A67452",
//     long: "0xB0E54de4ef2bA2D34C487d6598Ad6Befb538dd44",
//     micro: "0x7F44A86925054694a847252856686f1ec0e9309A",
//     multi: "0xd49b591fDB6E2b3918C7f32F550ad69978F1546A",
//     hot: "0x0ea4c779A8f54b8a867572daeF1747D4A5789489",
//     knockout: "0xbf8CA83Ab34282d00E805D7B5EaAee6c31516fB5",
//     koCross: "0x778a396F3fDcEA7E0E49a5F3a2592dfdda1a1f3c",
//     policy: "0x0a547ABFBf60C8860690c4840Be974091908D9b3",
//     query: "0x5750b36167aC5Fb6C041954a33dc9B53B5F1E330",
//     impact: "0xD391Bf862BB7c4ce9a654f16E0F8f0DD1F3b2799",
//     shell: "0xD391Bf862BB7c4ce9a654f16E0F8f0DD1F3b2799",
// };

// Ropsten
/*let tokens = {
    eth: ZERO_ADDR,
    dai: "0xaD6D458402F60fD3Bd25163575031ACDce07538D",
    usdc: "0x07865c6E87B9F70255377e024ace6630C1Eaa37F"
}*/

// Kovan
/*let tokens = {
    eth: ZERO_ADDR,
    dai: "0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa",
    usdc: "0xb7a4F3E9097C08dA09517b5aB877F7a917224ede"
}*/

// Goerli
const tokens = {
    eth: ZERO_ADDR,
    dai: "0xdc31Ee1784292379Fbb2964b3B9C4124D8F89C60",
    usdc: "0xD87Ba7A50B2E7E660f678A895E4B72E7CB4CCd9C",
};

const POOL_IDX = 36000;

const BOOT_PROXY_IDX = 0;
const SWAP_PROXY_IDX = 1;
const LP_PROXY_IDX = 2;
const COLD_PROXY_IDX = 3;
const LONG_PROXY_IDX = 4;
const MICRO_PROXY_IDX = 5;
const MULTICALL_PROXY_IDX = 6;
const KNOCKOUT_LP_PROXY_IDX = 7;
const FLAG_CROSS_PROXY_IDX = 3500;
const SAFE_MODE_PROXY_PATH = 9999;

const abi = new ethers.utils.AbiCoder();
const override = {gasLimit: 6000000};

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
    const multiswap = (addrs.multiswap ? factory.attach(addrs.multiswap) : await factory.deploy(addrs.dex, addrs.impact, override)) as CrocShell;
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
    const POOL_INIT_LIQ = 10000;
    const FEE_BPS = 28;
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
        const templateCmd = abi.encode(
            ["uint8", "uint256", "uint16", "uint16", "uint8", "uint8", "uint8"],
            [110, POOL_IDX, FEE_BPS * 100, TICK_SIZE, JIT_THRESH, knockoutFlag, 0],
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

    // let factory = await ethers.getContractFactory("MockERC20");
    // let dai = (await factory.deploy()) as MockERC20;
    // console.log("Dai: ", dai.address);
    // tokens.dai = dai.address;
    // await dai.deposit(authority.address, BigNumber.from(10).pow(36));
    //
    // let usdc = (await factory.deploy()) as MockERC20;
    // console.log("Usdc: ", usdc.address);
    // tokens.usdc = usdc.address;
    // await usdc.deposit(authority.address, BigNumber.from(10).pow(36));
    //
    // let tx = await dai.approve(dex.address, BigNumber.from(10).pow(36));
    // await tx.wait();
    //
    // tx = await usdc.approve(dex.address, BigNumber.from(10).pow(36));
    // await tx.wait();
    //
    // console.log("Q");
    // let initPoolCmd = abi.encode(
    //   ["uint8", "address", "address", "uint256", "uint128"],
    //   [71, tokens.eth, tokens.dai, 36000, toSqrtPrice(1 / 3000)],
    // );
    // tx = await dex.userCmd(COLD_PROXY_IDX, initPoolCmd, { value: BigNumber.from(10).pow(15), gasLimit: 6000000 });
    // console.log("init pool", tx);
    // await tx.wait();
    //
    // let initUsdcCmd = abi.encode(
    //   ["uint8", "address", "address", "uint256", "uint128"],
    //   [71, tokens.usdc, tokens.dai, 36000, toSqrtPrice(1)],
    // );
    // tx = await dex.userCmd(COLD_PROXY_IDX, initUsdcCmd, { gasLimit: 6000000 });
    // console.log("init usdc", tx);
    // await tx.wait();
    //
    // let mintCmd = abi.encode(
    //   ["uint8", "address", "address", "uint256", "int24", "int24", "uint128", "uint128", "uint128", "uint8", "address"],
    //   [31, tokens.eth, tokens.dai, 36000, 0, 0, BigNumber.from(10).pow(15), MIN_PRICE, MAX_PRICE, 0, ZERO_ADDR],
    // );
    // tx = await dex.userCmd(2, mintCmd, { value: BigNumber.from(10).pow(15), gasLimit: 6000000 });
    // console.log("mint", tx);
    // await tx.wait();
    //
    // let cmd = abi.encode(
    //   ["uint8", "address", "address", "uint256", "int24", "int24", "uint128", "uint128", "uint128", "uint8", "address"],
    //   [31, tokens.usdc, tokens.dai, 36000, 0, 0, BigNumber.from(10).pow(3), MIN_PRICE, MAX_PRICE, 0, ZERO_ADDR],
    // );
    // tx = await dex.userCmd(2, cmd, { gasLimit: 6000000 });
    // console.log("mint usdc", tx);
    // await tx.wait();
    //
    // tx = await dex.swap(tokens.eth, tokens.dai, 36000, true, true, BigNumber.from(10).pow(12), 0, MAX_PRICE, 0, 0, {
    //   value: BigNumber.from(10).pow(12),
    // });
    // console.log("swap eth", tx);
    // await tx.wait();
    //
    // tx = await dex.swap(tokens.eth, tokens.dai, 36000, false, true, BigNumber.from(10).pow(12), 0, MIN_PRICE, 0, 0);
    // console.log("swap eth", tx);
    // await tx.wait();
    //
    // tx = await dex.swap(tokens.usdc, tokens.dai, 36000, true, false, BigNumber.from(10).pow(2), 0, MAX_PRICE, 0, 0);
    // console.log("swap usdc", tx);
    // await tx.wait();

    // Burn ambient
    /*cmd = abi.encode(["uint8", "address", "address", "uint256", "int24", "int24", "uint128", "uint128", "uint128", "uint8", "address"],
        [41, tokens.eth, tokens.dai, 36000, 0, 0, BigNumber.from(10).pow(15), MIN_PRICE, MAX_PRICE, 0, ZERO_ADDR ])
    tx = await dex.userCmd(2, cmd, {gasLimit: 6000000})
    await tx.wait()*/

    // Remint
    /*cmd = abi.encode(["uint8", "address", "address", "uint256", "int24", "int24", "uint128", "uint128", "uint128", "uint8", "address"],
        [31, tokens.eth, tokens.dai, 36000, 0, 0, BigNumber.from(10).pow(15), MIN_PRICE, MAX_PRICE, 0, ZERO_ADDR ])
    tx = await dex.userCmd(2, cmd, {gasLimit: 6000000, value: BigNumber.from(10).pow(15) })
    console.log(tx)
    await tx.wait()*/

    // Mint concentrated liquidity
    /*cmd = abi.encode(["uint8", "address", "address", "uint256", "int24", "int24", "uint128", "uint128", "uint128", "uint8", "address"],
        [11, tokens.eth, tokens.dai, 36000, -128000+256, 128000-256, BigNumber.from(10).pow(15), MIN_PRICE, MAX_PRICE, 0, ZERO_ADDR ])
    tx = await dex.userCmd(2, cmd, {gasLimit: 6000000, value: BigNumber.from(10).pow(15) })
    console.log(tx)
    await tx.wait()*/

    /*cmd = abi.encode(["uint8", "address", "address", "uint256", "int24", "int24", "uint128", "uint128", "uint128", "uint8", "address"],
        [21, tokens.eth, tokens.dai, 36000, -128000+64, 128000-64, BigNumber.from(10).pow(15), MIN_PRICE, MAX_PRICE, 0, ZERO_ADDR ])
    tx = await dex.userCmd(2, cmd, {gasLimit: 6000000, value: BigNumber.from(10).pow(16) })
    console.log(tx)
    await tx.wait()*/
}

deploy();
