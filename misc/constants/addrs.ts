import { ethers } from "hardhat"

// Convention is to use empty string for pre-deployed contract
export interface CrocAddrs {
    dex: string,
    cold: string,
    warm: string,
    long: string,
    micro: string,
    hot: string,
    knockout: string,
    koCross: string,
    policy: string,
    query: string,
    impact: string,
    shell: string,
    policyShell: string,
    deployer: string,
}

const emptyAddrs: CrocAddrs = {
    dex: "",
    cold: "",
    warm: "",
    long: "",
    micro: "",
    hot: "",
    knockout: "",
    koCross: "",
    policy: "",
    query: "",
    impact: "",
    shell: "",
    policyShell: "",
    deployer: "",
}

// Mainnet
const mainnetAddrs: CrocAddrs = {
    dex: "",
    cold: "",
    warm: "",
    long: "",
    micro: "",
    hot: "",
    knockout: "",
    koCross: "",
    policy: "",
    query: "",
    impact: "",
    shell: "",
    policyShell: "",
    deployer: "",
}

// Goerli
const goerliAddrs: CrocAddrs = {
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
    shell: "0xdf2a97ae85e8ce33ad20ad2d3960fd92e8079861",
    policyShell: "",
    deployer: "",
}

export let CROC_ADDRS = {
    '0x1': mainnetAddrs,
    '0x5': goerliAddrs,
}

// Goerli
export let TOKEN_ADDRS = {
    '0x5': {
        eth: ethers.constants.AddressZero,
        dai: "0xdc31Ee1784292379Fbb2964b3B9C4124D8F89C60",
        usdc: "0xD87Ba7A50B2E7E660f678A895E4B72E7CB4CCd9C"
    }
}

export let POOL_IDXS = {
    '0x5': 36000,
    '0x1': 420
}

export const BOOT_PROXY_IDX = 0;
export const SWAP_PROXY_IDX = 1;
export const LP_PROXY_IDX = 2;
export const COLD_PROXY_IDX = 3;
export const LONG_PROXY_IDX = 4;
export const MICRO_PROXY_IDX = 5;
export const KNOCKOUT_LP_PROXY_IDX = 7;
export const FLAG_CROSS_PROXY_IDX = 3500;
export const SAFE_MODE_PROXY_PATH = 9999;

