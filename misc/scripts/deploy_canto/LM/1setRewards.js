// Deploy Croc Lens Contracts

const { BigNumber } = require("ethers");
var AbiCoder = require("@ethersproject/abi").AbiCoder;
var keccak256 = require("@ethersproject/keccak256").keccak256;

const abi = new AbiCoder();

// testnet dex address
const dexAddress = "0xA4C0F8febA559083Fe47E396f7C4f047E8820253";
const usdcAddress = "0xc51534568489f47949A828C8e3BF68463bdF3566";
const cNoteAddress = "0x04E52476d318CdF739C38BD41A922787D441900c";

async function main() {
	const [deployer] = await ethers.getSigners();

	console.log("set rewards with the account:", deployer.address);
	const CrocSwapDex = await hre.ethers.getContractFactory("CrocSwapDex");
	const dex = await CrocSwapDex.attach(dexAddress);

	/*
	/	1. set concentrated rewards for usdc/cnote pair
	/      code 117 = SET_CONC_REWARDS_CODE
	*/
	let poolHash = abi.encode(
		["address", "address", "uint256"],
		[cNoteAddress, usdcAddress, 36000]
	);
	let setRewards = abi.encode(
		["uint8", "bytes32", "uint32", "uint32", "uint64"],
		[117, keccak256(poolHash), 1696162651, 1696162851, 1185880]
	);
	tx = await dex.protocolCmd(8, setRewards, false, { gasLimit: 6000000 });
	await tx.wait();
	console.log("Set rewards");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
