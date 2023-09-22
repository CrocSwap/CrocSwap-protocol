// Deploy Dex contract and all paths

async function main() {
	const [deployer] = await ethers.getSigners();

	console.log("Deploying contracts with the account:", deployer.address);

	// deploy CrocSwapDex contract
	const dex = await ethers.deployContract("CrocSwapDex");
	// deploy ColdPath
	const ColdPath = await ethers.deployContract("ColdPath");
	// deploy HotPath
	const HotProxy = await ethers.deployContract("HotProxy");
	// deploy KnockoutPath
	const KnockoutLiqPath = await ethers.deployContract("KnockoutLiqPath");
	// deploy CrossKnockoutPath
	const CrossKnockoutLiqPath = await ethers.deployContract(
		"KnockoutFlagPath"
	);
	// deploy LongPath
	const LongPath = await ethers.deployContract("LongPath");
	// deploy MicroPath
	const MicroPaths = await ethers.deployContract("MicroPaths");
	// deploy SafeModePath
	const SafeModePath = await ethers.deployContract("SafeModePath");
	// deploy WarmPath
	const WarmPath = await ethers.deployContract("WarmPath");

	console.log("CrocSwapDex address:", await dex.address);
	console.log("ColdPath address:", await ColdPath.address);
	console.log("HotProxy address:", await HotProxy.address);
	console.log("KnockoutLiqPath address:", await KnockoutLiqPath.address);
	console.log(
		"CrossKnockoutLiqPath address:",
		await CrossKnockoutLiqPath.address
	);
	console.log("LongPath address:", await LongPath.address);
	console.log("MicroPaths address:", await MicroPaths.address);
	console.log("SafeModePath address:", await SafeModePath.address);
	console.log("WarmPath address:", await WarmPath.address);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
