// Deploy Croc Lens Contracts

const { BigNumber } = require("ethers");
var AbiCoder = require("@ethersproject/abi").AbiCoder;

const abi = new AbiCoder();

const PRECISION = 100000000;
const Q_64 = BigNumber.from(2).pow(64);

// testnet dex address
const dexAddress = "0xACB4D5CcFD3291A6b17bE2f117C12A278F57C024";
const usdcAddress = "0xc51534568489f47949A828C8e3BF68463bdF3566";
const cNoteAddress = "0x04E52476d318CdF739C38BD41A922787D441900c";

async function main() {
	const [deployer] = await ethers.getSigners();

	console.log("Deploying pool with the account:", deployer.address);
	// attach to CrocSwapDex contract
	const CrocSwapDex = await hre.ethers.getContractFactory("CrocSwapDex");
	const dex = await CrocSwapDex.attach(dexAddress);

	// attach to ERC20s for approval
	const USDCFactory = await hre.ethers.getContractFactory("MockERC20");
	const USDC = await USDCFactory.attach(usdcAddress);

	const cNOTEFactory = await hre.ethers.getContractFactory("MockERC20");
	const cNOTE = await cNOTEFactory.attach(cNoteAddress);

	// 1. approve USDC and cNOTE for dex
	await USDC.approve(dexAddress, BigNumber.from(10).pow(36));
	await cNOTE.approve(dexAddress, BigNumber.from(10).pow(36));

	// 2. set new pool liquidity (amount to lock up for new pool)
	let setPoolLiqCmd = abi.encode(["uint8", "uint128"], [112, 1]);
	tx = await dex.protocolCmd(3, setPoolLiqCmd, true);
	await tx.wait();
	console.log(tx);

	// 3. set a new template at slot 36000
	let templateCmd = abi.encode(
		["uint8", "uint256", "uint16", "uint16", "uint8", "uint8", "uint8"],
		[110, 36000, 500, 64, 5, 64, 0]
	);
	tx = await dex.protocolCmd(3, templateCmd, false);
	await tx.wait();
	console.log(tx);

	// 4. initialize the new pool with USDC and cNOTE
	let initPoolCmd = abi.encode(
		["uint8", "address", "address", "uint256", "uint128"],
		[71, usdcAddress, cNoteAddress, 36000, 1]
	);
	tx = await dex.userCmd(3, initPoolCmd, { gasLimit: 6000000 });
	console.log(tx);
	await tx.wait();

	// // set protocol take rate
	// let takeRateCmd = abi.encode(["uint8", "uint16"], [114, 0]);
	// tx = await dex.protocolCmd(3, takeRateCmd, true);
	// await tx.wait();
	// console.log(tx);

	// // set relayer take rate
	// let relayerTakeRateCmd = abi.encode(["uint8", "uint16"], [116, 0]);
	// tx = await dex.protocolCmd(3, relayerTakeRateCmd, true);
	// await tx.wait();
	// console.log(tx);

	// // deposit surplus USDC and cNOTE into pool
	// let depositSurplusUSDCCmd = abi.encode(
	// 	["uint8", "address", "uint128", "address"],
	// 	[73, "0xEf109EF4969261eB92A9F00d6639b440160Cc237", 100000, usdcAddress]
	// );
	// tx = await dex.userCmd(3, depositSurplusUSDCCmd);
	// let depositSurpluNOTECmd = abi.encode(
	// 	["uint8", "address", "uint128", "address"],
	// 	[
	// 		73,
	// 		"0xEf109EF4969261eB92A9F00d6639b440160Cc237",
	// 		1000000000000,
	// 		cNoteAddress,
	// 	]
	// );
	// tx = await dex.userCmd(3, depositSurpluNOTECmd);
}

function toSqrtPrice(price) {
	let sqrtFixed = Math.round(Math.sqrt(price) * PRECISION);
	return BigNumber.from(sqrtFixed).mul(Q_64).div(PRECISION);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
