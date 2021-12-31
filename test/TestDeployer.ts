import { TestOracleHistory } from '../typechain/TestOracleHistory'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { toFixedGrowth, fromFixedGrowth, toSqrtPrice } from './FixedPoint';
import { BigNumber, Signer } from 'ethers';
import { CrocMaster } from '../typechain/CrocMaster';
import { MockMinion } from '../typechain/MockMinion';
import { CrocDeployer } from '../typechain/CrocDeployer';
import { CrocSwapDexSeed } from '../typechain/CrocSwapDexSeed';
import { isMaster } from 'cluster';

chai.use(solidity);

const MIN_DELAY = 25000
const MAX_DELAY = 50000
const VOTE_THRESH = 3
const NUM_ELECTORS = 5

describe('Croc Deployer', () => {
    let dex: CrocSwapDexSeed
    let deployer: CrocDeployer
    let multisigs: string[]

   beforeEach("deploy", async () => {
       let signers = (await ethers.getSigners())
       let electors = signers.slice(0, NUM_ELECTORS) as Signer[]

       let factory = await ethers.getContractFactory("CrocDeployer");
       deployer = (await factory.deploy()) as CrocDeployer

       factory = await ethers.getContractFactory("CrocSwapDexSeed");
       dex = (await factory.deploy(deployer.address)) as CrocSwapDexSeed

       multisigs = await Promise.all(electors.map(e => e.getAddress()))
   })

   it("decentralize", async () => {
       await deployer.decentralize(dex.address, MIN_DELAY, MAX_DELAY, VOTE_THRESH, multisigs)

       let masterAddr = await deployer.master_()
       let factory = await ethers.getContractFactory("CrocMaster")
       let master = (await factory.attach(masterAddr)) as CrocMaster

       expect(await master.dex_()).to.equal(dex.address)
       expect(await master.minDelay_()).to.equal(MIN_DELAY)
       expect(await master.maxDelay_()).to.equal(MAX_DELAY)
       expect(await master.voteThreshold_()).to.equal(VOTE_THRESH)
       expect(await master.electors_(multisigs[1])).to.be.true       
   })
})