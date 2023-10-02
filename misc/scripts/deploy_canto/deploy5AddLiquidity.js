// Deploy Croc Lens Contracts

const { BigNumber } = require("ethers");
var AbiCoder = require("@ethersproject/abi").AbiCoder;

const abi = new AbiCoder();

const PRECISION = 100000000;
const Q_64 = BigNumber.from(2).pow(64);

// testnet dex address
const dexAddress = "0xA4C0F8febA559083Fe47E396f7C4f047E8820253";
const usdcAddress = "0xc51534568489f47949A828C8e3BF68463bdF3566";
const cNoteAddress = "0x04E52476d318CdF739C38BD41A922787D441900c";

async function main() {
	const [deployer] = await ethers.getSigners();

	console.log("Adding liquidity with the account:", deployer.address);
	// attach to CrocSwapDex contract
	const CrocSwapDex = await hre.ethers.getContractFactory("CrocSwapDex");
	const dex = await CrocSwapDex.attach(dexAddress);

	const currentTick = 276324;
	const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

	// Mint concentrated liquidity
	let mintConcentratedLiqCmd = abi.encode(
		[
			"uint8",
			"address",
			"address",
			"uint256",
			"int24",
			"int24",
			"uint128",
			"uint128",
			"uint128",
			"uint8",
			"address",
		],
		[
			11, // code (mint concentrated liquidity in base token liq)
			cNoteAddress, // base token
			usdcAddress, // quote token
			36000, // poolIDX
			currentTick - 10, // tickLower
			currentTick + 10, // tickUpper
			BigNumber.from("100000000000000000000"), // amount of base token to send
			BigNumber.from("16602069666338596454400000"), // min price
			BigNumber.from("20291418481080506777600000"), // max price
			0, // reserve flag
			ZERO_ADDR, // lp conduit address (0 if not using)
		]
	);
	tx = await dex.userCmd(2, mintConcentratedLiqCmd, {
		gasLimit: 6000000,
		value: ethers.utils.parseUnits("1", "ether"),
	});
	await tx.wait();
	console.log(tx);
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
