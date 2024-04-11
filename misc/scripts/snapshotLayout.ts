const hre = require("hardhat");
import path from "path";
import fs from "fs";

let nonCoreContracts = [
  "CrocPolicy",
  "CrocQuery",
  "CrocFacuet",
  "TimelockAccepts",
  "CrocLpErc20",
  "ERC20",
  "CrocDeployer",
  "Timelock",
  "TimelockController",
  "AccessControl",
  "QueryHelper",
  "StoragePrototypes"
]

interface StorageEntry {
  contractName: string,
  name: string,
  slot: number,
  offset: number,
  type: string,
  size: number
}

let entries = new Map<string, StorageEntry[]>();

function pushEntry (abiSource: string, entry: StorageEntry) {
  let table = entries.get(abiSource)
  if (!table) {
    table = [entry]
    entries.set(abiSource, table);
  } else {
    table.push(entry)
  }
}

function standardizeTypeData (typeStr: string): string {
  if (typeStr.includes("t_struct")) {
    return typeStr.replace(/\d+(?=_storage)/, '');
  } else {
    return typeStr
  }
}

function isCoreContract (contractName: string): boolean {
  return !nonCoreContracts.includes(contractName) && 
  !contractName.startsWith("Test") && !contractName.startsWith("Mock")
}

function writeEntries() {
  entries.forEach((entries: StorageEntry[], source: string) => {
    let outputFile = source.replace(/^\/build-info\/(.+)$/, 'layout.$1');
    fs.writeFileSync(outputFile, JSON.stringify({ data: entries }, null, 2))
    console.log("Storage layout written to " + outputFile)
  })
}

async function main() {

  const storageLayoutPath = hre.config.paths.newStorageLayoutPath;
  const outputDirectory = path.resolve(storageLayoutPath);
  if (!outputDirectory.startsWith(hre.config.paths.root)) {
    throw new Error(
      "output directory should be inside the project directory"
    );
  }

  const buildInfos = await hre.artifacts.getBuildInfoPaths();
  const artifactsPath = hre.config.paths.artifacts;
  const artifacts = buildInfos.map((source: any, idx: any) => {
    const artifact: Buffer = fs.readFileSync(source);
    return {
      idx,
      source: source.startsWith(artifactsPath)
        ? source.slice(artifactsPath.length)
        : source,
      data: JSON.parse(artifact.toString())
    };
  });

  const names: Array<{ sourceName: string; contractName: string }> = [];
  for (const fullName of await hre.artifacts.getAllFullyQualifiedNames()) {
    const {
      sourceName,
      contractName
    } = await hre.artifacts.readArtifact(fullName);
    names.push({ sourceName, contractName });
  }
  names.sort((a, b) => a.contractName.localeCompare(b.contractName));

  for (const { sourceName, contractName } of names) {
    if (isCoreContract(contractName)) {
      for (const artifactJsonABI of artifacts) {

        const storage =
          artifactJsonABI.data.output?.contracts?.[sourceName]?.[contractName]
            ?.storageLayout?.storage;
        if (!storage) {
          continue;
        }
                
        for (const stateVariable of storage) {
          const numBytes = artifactJsonABI.data.output?.contracts[sourceName][contractName]
            .storageLayout.types[stateVariable.type].numberOfBytes
          pushEntry(artifactJsonABI.source, {
            contractName: contractName,
            name: stateVariable.label,
            slot: parseInt(stateVariable.slot),
            offset: parseInt(stateVariable.offset),
            type: standardizeTypeData(stateVariable.type),
            size:
              parseInt(artifactJsonABI.data.output?.contracts[sourceName][contractName]
                .storageLayout.types[stateVariable.type].numberOfBytes)
          })
          
        }

      }
    }
  }

  writeEntries();
}

main();
