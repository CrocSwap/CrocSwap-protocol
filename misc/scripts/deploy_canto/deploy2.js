// Configure paths for the dex contract

var AbiCoder = require("@ethersproject/abi").AbiCoder;

const abi = new AbiCoder();

// testnet addresses 1
// const addresses = {
// 	CrocSwapDex: "0x3b72043fc6dcd2c10201eb775570bdae2237a5c0",
// 	ColdPath: "0x7336fd03d2490175acca515ae2d5afed2a232e30",
// 	HotProxy: "0xba783019e4937073340A308b933Ce0BE64ccD64A",
// 	KnockoutLiqPath: "0x07a0406c7ea542bf2fee92b94586057c25318817",
// 	CrossKnockoutLiqPath: "0xf91D5d838FDcCDa8224DFB944D140CFDcA73e2cc",
// 	LongPath: "0xac79b5e09aa1557fb42e53426fb4534fc648edb2",
// 	MicroPaths: "0x9b6681d01857841d404f90a6ad3422e5d8140ebc",
// 	SafeModePath: "0x7689a7f88d85de0b7c1ea4f35eb3e155c751fd89",
// 	WarmPath: "0x48ee738bf78956bd9a4a38f1028d1fae6b9c74bb",
// };

// testnet addresses 2
const addresses = {
	CrocSwapDex: "0xd9bac85f6ac9fBFd2559A4Ac2883c635C29Feb4b",
	HotProxy: "0xB33B14c1042F37a1d0671BbF59dDdaE9eEAaabca",
	WarmPath: "0x509EeEe3db2648a923FC97fB23AA92e76a913F32",
	ColdPath: "0x90d5e19e389443bB9Cc71A1d4203BBa00c0E7A33",
	LongPath: "0xBf6D9783BFB27E7A497636ab2B23948a8Aa30E6b",
	MicroPaths: "0x3e51083feF8b61B1aD6D2637423A31B324D7da9a",
	KnockoutLiqPath: "0x0783646705d7266CfD22374ba071f7785a10C7cC",
	KnockoutFlagPath: "0xeAE58C8a7F995Bb04D1Aeba691749BC89168F2B4",
	SafeModePath: "0x160E16a11ac5C5D146Dfa6b45b94faCD00A9D62A",
};

const BOOT_PROXY_IDX = 0;
const SWAP_PROXY_IDX = 1;
const LP_PROXY_IDX = 2;
const COLD_PROXY_IDX = 3;
const LONG_PROXY_IDX = 4;
const MICRO_PROXY_IDX = 5;
const KNOCKOUT_LP_PROXY_IDX = 7;
const FLAG_CROSS_PROXY_IDX = 3500;
const SAFE_MODE_PROXY_PATH = 9999;

async function main() {
	const [deployer] = await ethers.getSigners();

	console.log("Configuring contracts with the account:", deployer.address);

	// attach to CrocSwapDex contract
	const CrocSwapDex = await hre.ethers.getContractFactory("CrocSwapDex");
	const dex = await CrocSwapDex.attach(addresses.CrocSwapDex);

	// use protocolCmd to install paths
	// install coldpath
	cmd = abi.encode(
		["uint8", "address", "uint16"],
		[21, addresses.ColdPath, COLD_PROXY_IDX]
	);
	await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);

	// install longpath
	cmd = abi.encode(
		["uint8", "address", "uint16"],
		[21, addresses.LongPath, LONG_PROXY_IDX]
	);
	await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);

	// install warm path
	cmd = abi.encode(
		["uint8", "address", "uint16"],
		[21, addresses.WarmPath, LP_PROXY_IDX]
	);
	await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);

	// install hot proxy path
	cmd = abi.encode(
		["uint8", "address", "uint16"],
		[21, addresses.HotProxy, SWAP_PROXY_IDX]
	);
	await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);

	// install micro paths
	cmd = abi.encode(
		["uint8", "address", "uint16"],
		[21, addresses.MicroPaths, MICRO_PROXY_IDX]
	);
	await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);

	// install knockout lp proxy path
	cmd = abi.encode(
		["uint8", "address", "uint16"],
		[21, addresses.KnockoutLiqPath, KNOCKOUT_LP_PROXY_IDX]
	);
	await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);

	// install cross knockout cross proxy path
	cmd = abi.encode(
		["uint8", "address", "uint16"],
		[21, addresses.KnockoutFlagPath, FLAG_CROSS_PROXY_IDX]
	);
	await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
