// Deploy Croc Lens Contracts

const { BigNumber } = require("ethers");
var AbiCoder = require("@ethersproject/abi").AbiCoder;

const abi = new AbiCoder();

// testnet dex address
const dexAddress = "0xcbE102f2dC2F9d8244c276899eF9F9Fa1c88Cb6d";

async function main() {
	const [deployer] = await ethers.getSigners();

	console.log("set admin with the account:", deployer.address);
	const CrocSwapDex = await hre.ethers.getContractFactory("CrocSwapDex");

	const dex = await CrocSwapDex.attach(dexAddress);

	/* 
	/	2. set admin for LM
	*/
	let setAdmin = abi.encode(
		["uint8", "address"],
		[42, "0xEf109EF4969261eB92A9F00d6639b440160Cc237"]
	);
	tx = await dex.protocolCmd(3, setAdmin, true);
	await tx.wait();
	console.log("Set admin");
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
