import { keccak256 } from "ethers/lib/utils";
import { ethers } from 'hardhat';

export const getCrocErc20LpAddress = async (base: string, quote: string, dexAddress: string) => {
  const salt = ethers.utils.keccak256(
    ethers.utils.solidityPack(["address", "address"], [base, quote]),
  );
  const factory = await ethers.getContractFactory("BeraCrocLpErc20")
  const creationCode = factory.bytecode;
  const initCodeHash = keccak256(creationCode);
  const create2Address = ethers.utils.getCreate2Address(
    dexAddress,
    salt,
    initCodeHash,
  );
  return create2Address;
};
