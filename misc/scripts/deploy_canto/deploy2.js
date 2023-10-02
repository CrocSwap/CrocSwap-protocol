// Configure paths for the dex contract

var AbiCoder = require("@ethersproject/abi").AbiCoder;

const abi = new AbiCoder();

// testnet addresses 1
const addresses = {
	CrocSwapDex: "0xA4C0F8febA559083Fe47E396f7C4f047E8820253",
	HotProxy: "0xcf883bB0B1903b96B10242696D62d54BE94Aa2f5",
	WarmPath: "0xafC5554c7710F760E79f748eb900A28B7b1E4FA7",
	ColdPath: "0x3b62C6B3430832B970551eab21268e7C87A48912",
	LongPath: "0x4d9E727A61b8BEc65300A1b05b31E01C82d4B982",
	MicroPaths: "0x663f021531BDE01C2373dA41c3144115e06f9211",
	KnockoutLiqPath: "0xcA54dcD6B08687e61D0E44010af35C65C4EDefF4",
	KnockoutFlagPath: "0x575298cbc88faB5433928D1cF27C57d779677844",
	SafeModePath: "0xC428162feD5E33cBf604dfCBa8Eb9247DE9722a4",
	LiquidityMiningPath: "0x5e27C6FD3967275E566F55A4F2f2e56A0d29A461",
};

const BOOT_PROXY_IDX = 0;
const SWAP_PROXY_IDX = 1;
const LP_PROXY_IDX = 2;
const COLD_PROXY_IDX = 3;
const LONG_PROXY_IDX = 4;
const MICRO_PROXY_IDX = 5;
const KNOCKOUT_LP_PROXY_IDX = 7;
const LIQUIDITY_MINING_PROXY_IDX = 8;
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

	// install liquidity mining path
	cmd = abi.encode(
		["uint8", "address", "uint16"],
		[21, addresses.LiquidityMiningPath, LIQUIDITY_MINING_PROXY_IDX]
	);
	await dex.protocolCmd(BOOT_PROXY_IDX, cmd, true);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
