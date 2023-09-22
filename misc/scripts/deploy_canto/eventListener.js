// Deploy Croc Lens Contracts
var abi =
	require("../../../artifacts/contracts/callpaths/ColdPath.sol/ColdPath.json").abi;

// testnet dex address
const dexAddress = "0x3b72043Fc6Dcd2C10201eb775570bdae2237a5c0";

async function main() {
	const [deployer] = await ethers.getSigners();

	console.log("Deploying contracts with the account:", deployer.address);

	const CrocSwapDex = await ethers.ContractFactory("CrocSwapDex");
	const provider = new ethers.providers.JsonRpcProvider(
		"https://testnet-archive.plexnode.wtf"
	);

	console.log(getEvents);
}

const getEvents = async () => {
	const poolContract = new Contract(
		"0xF5202Cf9Ee626039beB1f0087830C256e3457440",
		abi,
		provider
	);
	const mintFilter = poolContract.filters.NewPool();
	console.log("Querying the events...");
	const mintEvents = await poolContract.queryFilter(
		mintFilter,
		3689527,
		3689570
	);
	console.log(
		`${mintEvents.length} have been emitted by the pool with id ${poolId} between blocks ${startBlock} & ${endBlock}`
	);
	return mintEvents;
};

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
