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
	const KnockoutFlagPath = await ethers.deployContract("KnockoutFlagPath");
	// deploy LongPath
	const LongPath = await ethers.deployContract("LongPath");
	// deploy MicroPath
	const MicroPaths = await ethers.deployContract("MicroPaths");
	// deploy SafeModePath
	const SafeModePath = await ethers.deployContract("SafeModePath");
	// deploy WarmPath
	const WarmPath = await ethers.deployContract("WarmPath");

	console.log("CrocSwapDex:", await dex.address);
	console.log("HotProxy:", await HotProxy.address);
	console.log("WarmPath:", await WarmPath.address);
	console.log("ColdPath:", await ColdPath.address);
	console.log("LongPath:", await LongPath.address);
	console.log("MicroPaths:", await MicroPaths.address);
	console.log("KnockoutLiqPath:", await KnockoutLiqPath.address);
	console.log("KnockoutFlagPath:", await KnockoutFlagPath.address);
	console.log("SafeModePath:", await SafeModePath.address);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
