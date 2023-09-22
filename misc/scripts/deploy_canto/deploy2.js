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
	CrocSwapDex: "0xACB4D5CcFD3291A6b17bE2f117C12A278F57C024",
	ColdPath: "0xF5202Cf9Ee626039beB1f0087830C256e3457440",
	HotProxy: "0x2cDFF351614470B60aabCb4CF58475D4AB06709e",
	KnockoutLiqPath: "0xD983503C1F9C014cEb4F936Da64Dd608397E6774",
	CrossKnockoutLiqPath: "0x2E8fe08D63b36B753a8df66047b0fa3259fAe5Cd",
	LongPath: "0xEf0b15283fb6B1d176981DbcEbdbAdF756853a34",
	MicroPaths: "0x8d222C05098382946Cd78568C65f53127F2c3490",
	SafeModePath: "0x077873fF9d6151Bfe68B738F6Afaf9aa67418f7a",
	WarmPath: "0xbDE6D21E26921f86690e3ea32039652b8Ac00745",
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

	// use protocolCmd to set paths

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
		[21, addresses.CrossKnockoutLiqPath, FLAG_CROSS_PROXY_IDX]
	);
	await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
