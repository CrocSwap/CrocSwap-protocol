// Deploy Croc Lens Contracts

// testnet dex address
const dexAddress = "0xACB4D5CcFD3291A6b17bE2f117C12A278F57C024";

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
