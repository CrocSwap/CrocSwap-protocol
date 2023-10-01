// Deploy Croc Lens Contracts

// testnet dex address
const dexAddress = "0xA4C0F8febA559083Fe47E396f7C4f047E8820253";

async function main() {
	const [deployer] = await ethers.getSigners();

	console.log("Deploying contracts with the account:", deployer.address);

	// deploy CrocImpact
	const CrocImpact = await ethers.getContractFactory("CrocImpact");
	const impact = await CrocImpact.deploy(dexAddress);

	// deploy CrockQuery
	const CrockQuery = await ethers.getContractFactory("CrocQuery");
	const query = await CrockQuery.deploy(dexAddress);

	console.log("CrocImpact address:", await impact.address);
	console.log("CrockQuery address:", await query.address);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
