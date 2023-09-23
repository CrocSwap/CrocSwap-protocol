// Deploy Croc Lens Contracts

const { BigNumber } = require("ethers");
var AbiCoder = require("@ethersproject/abi").AbiCoder;

const abi = new AbiCoder();

const PRECISION = 100000000;
const Q_64 = BigNumber.from(2).pow(64);

// testnet dex address
const dexAddress = "0xd9bac85f6ac9fBFd2559A4Ac2883c635C29Feb4b";
const usdcAddress = "0xc51534568489f47949A828C8e3BF68463bdF3566";
const cNoteAddress = "0x04E52476d318CdF739C38BD41A922787D441900c";

async function main() {
	const [deployer] = await ethers.getSigners();
	const CrocSwapDex = await hre.ethers.getContractFactory("CrocSwapDex");
	const USDCFactory = await hre.ethers.getContractFactory("MockERC20");
	const cNOTEFactory = await hre.ethers.getContractFactory("MockERC20");

	const dex = await CrocSwapDex.attach(dexAddress);
	const USDC = await USDCFactory.attach(usdcAddress);
	const cNOTE = await cNOTEFactory.attach(cNoteAddress);

	// get balances of USDC and cNOTE pre-swap
	let usdcBal = await USDC.balanceOf(deployer.address);
	let cNoteBal = await cNOTE.balanceOf(deployer.address);
	console.log("USDC balance before swap: ", usdcBal.toString());
	console.log("cNote balance before swap: ", cNoteBal.toString());

	console.log("Trading 1 cNote for 1 USDC...");

	// // swap transaction
	// swapTx = await dex.swap(
	// 	cNoteAddress,
	// 	usdcAddress,
	// 	36000,
	// 	true,
	// 	true,
	// 	BigNumber.from("50000000000000000000"),
	// 	0,
	// 	BigNumber.from("20291418481080506777600000"),
	// 	BigNumber.from("1900000"),
	// 	2
	// );

	swapTx = await dex.swap(
		cNoteAddress,
		usdcAddress,
		36000,
		false,
		false,
		BigNumber.from("20000000"),
		0,
		BigNumber.from("16602069666338596454400000"),
		BigNumber.from("19000000000000000000"),
		0
	);

	await swapTx.wait();
	console.log(swapTx);

	// get balances of USDC and cNOTE post-swap
	usdcBal = await USDC.balanceOf(deployer.address);
	cNoteBal = await cNOTE.balanceOf(deployer.address);
	console.log("USDC balance after swap: ", usdcBal.toString());
	console.log("cNote balance after swap: ", cNoteBal.toString());
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
