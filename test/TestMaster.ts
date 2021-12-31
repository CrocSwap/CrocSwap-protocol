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

chai.use(solidity);

const MIN_DELAY = 25000
const MAX_DELAY = 50000
const VOTE_THRESH = 3
const NUM_ELECTORS = 5

describe('Croc Master', () => {
    let master: CrocMaster
    let minion: MockMinion
    let electors: Signer[]
    let jabroni: Signer

   beforeEach("deploy", async () => {
       let signers = (await ethers.getSigners())
       electors = signers.slice(0, NUM_ELECTORS)
       jabroni = signers[NUM_ELECTORS+1]
       let factory = await ethers.getContractFactory("MockMinion");
       minion = (await factory.deploy()) as MockMinion;

       let whitelist = electors.map(e => e.getAddress())
       factory = await ethers.getContractFactory("CrocMaster");
       master = (await factory.deploy(minion.address, MIN_DELAY, MAX_DELAY, VOTE_THRESH, whitelist)) as CrocMaster;
   })

   it("unauthorized proposer", async () => {
       await expect(master.connect(jabroni).propose(100, "0x153")).to.be.reverted
   })

   it("repeat proposal", async () => {
       await master.connect(electors[0]).propose(100, "0x12")
       await expect(master.connect(electors[0]).propose(100, "0x12")).to.be.reverted
       await expect(master.connect(electors[0]).propose(100, "0xab")).to.be.reverted
       await expect(master.connect(electors[1]).propose(100, "0x12")).to.be.reverted

       await master.connect(electors[0]).propose(101, "0x12")
   })

   it("ratify non-existent", async () => {
    await master.connect(electors[0]).propose(100, "0x12")
    await master.connect(electors[0]).propose(99, "0x12")

    // These should fail because they both include a ratification on a non-existent proposal
    await expect(master.connect(electors[1]).ratify([101])).to.be.reverted
    await expect(master.connect(electors[1]).ratify([100, 101])).to.be.reverted

    // This should not because it only ratifies existing
    await expect(master.connect(electors[1]).ratify([99, 100])).to.not.be.reverted
   })

   it("ratify from proposer", async () => {
    await master.connect(electors[0]).propose(100, "0x12")
    await master.connect(electors[1]).propose(99, "0x13")

    // These should fail because the proposer has already implicitly voted yes
    await expect(master.connect(electors[0]).ratify([100])).to.be.reverted
    await expect(master.connect(electors[1]).ratify([99])).to.be.reverted
    await expect(master.connect(electors[0]).ratify([99, 100])).to.be.reverted
    await expect(master.connect(electors[1]).ratify([99, 100])).to.be.reverted

    // This should not because the ratifiers are non-proposers
    await expect(master.connect(electors[0]).ratify([99])).to.not.be.reverted
    await expect(master.connect(electors[1]).ratify([100])).to.not.be.reverted
    await expect(master.connect(electors[2]).ratify([99, 100])).to.not.be.reverted
   })

   it("ratify double", async () => {
    await master.connect(electors[0]).propose(100, "0x12")
    await master.connect(electors[1]).propose(99, "0x13")
    await master.connect(electors[2]).propose(101, "0x14")

    await master.connect(electors[0]).ratify([99])
    await master.connect(electors[1]).ratify([100])
    await master.connect(electors[2]).ratify([99, 100])

    // These should fail because the elector has already ratified the proposal previously
    await expect(master.connect(electors[0]).ratify([99])).to.be.reverted
    await expect(master.connect(electors[1]).ratify([100])).to.be.reverted
    await expect(master.connect(electors[2]).ratify([99])).to.be.reverted
    await expect(master.connect(electors[2]).ratify([100])).to.be.reverted
    await expect(master.connect(electors[0]).ratify([99, 101])).to.be.reverted

    // This should not because they are the first time the elector is ratifying
    await expect(master.connect(electors[0]).ratify([101])).to.not.be.reverted
    await expect(master.connect(electors[1]).ratify([101])).to.not.be.reverted
    await expect(master.connect(electors[3]).ratify([99, 100, 101])).to.not.be.reverted

    // Now they should fail because they're repeat votes
    await expect(master.connect(electors[0]).ratify([101])).to.be.reverted
    await expect(master.connect(electors[1]).ratify([101])).to.be.reverted
    await expect(master.connect(electors[3]).ratify([101])).to.be.reverted
  })

  it("execute below threshold", async () => {
    await master.connect(electors[0]).propose(101, "0x13")
    await master.connect(electors[0]).propose(100, "0x12")
    await master.connect(electors[1]).ratify([100])

    // Cannot execute because only two electors have ratified and multisig requires 3-of-5
    await expect(master.connect(electors[0]).execute([100])).to.be.reverted
    await expect(master.connect(electors[0]).execute([101])).to.be.reverted
    await expect(master.connect(electors[0]).execute([99])).to.be.reverted

    // Corner case. Calling execute does *not* count as a yes vote
    await expect(master.connect(electors[2]).execute([100])).to.be.reverted
    
    // 100 was ratified but 101 was not, so the overall tx should revert
    await master.connect(electors[2]).ratify([100])
    await expect(master.connect(electors[3]).execute([100, 101])).to.be.reverted
  })

  it("execute time lock", async () => {
    await master.connect(electors[0]).propose(101, "0x13")
    await master.connect(electors[1]).ratify([101])
    await master.connect(electors[2]).ratify([101])

    ethers.provider.send("evm_increaseTime", [MIN_DELAY - 1000])
    await expect(master.connect(electors[3]).execute([101])).to.be.reverted

    ethers.provider.send("evm_increaseTime", [1000])
    await expect(master.connect(electors[3]).execute([101])).to.be.not.reverted
  })

  // Timelock is based on proposal time, not ratify time
  it("execute time lock proposal", async () => {
    await master.connect(electors[0]).propose(101, "0x13")

    ethers.provider.send("evm_increaseTime", [MIN_DELAY + 1000])
    await master.connect(electors[1]).ratify([101])
    await master.connect(electors[2]).ratify([101])

    await expect(master.connect(electors[3]).execute([101])).to.be.not.reverted
  })

  // Attempt to execute a proposal that's past expiraton time.
  it("execute expire", async () => {
    await master.connect(electors[0]).propose(101, "0x13")

    ethers.provider.send("evm_increaseTime", [MAX_DELAY + 1000])
    await master.connect(electors[1]).ratify([101])
    await master.connect(electors[2]).ratify([101])

    await expect(master.connect(electors[3]).execute([101])).to.be.reverted
  })

  it("execute", async () => {
    await master.connect(electors[0]).propose(101, "0x13")
    await master.connect(electors[0]).propose(100, "0x12")
    await master.connect(electors[1]).ratify([100, 101])
    await master.connect(electors[2]).ratify([100, 101])

    ethers.provider.send("evm_increaseTime", [MIN_DELAY + 1000])
    await master.connect(electors[3]).execute([101, 100])

    // Execute should have called in the order the proposals were put in the array
    //expect(await minion.cmds_.length).to.eq(2)
    expect(await minion.cmds_(0)).to.eq("0x13")
    expect(await minion.cmds_(1)).to.eq("0x12")
    expect(await minion.callers_(0)).to.eq(await electors[3].getAddress())
    expect(await minion.callers_(1)).to.eq(await electors[3].getAddress())
  })

  it("execute unauthorized", async () => {
    await master.connect(electors[0]).propose(101, "0x13")
    await master.connect(electors[0]).propose(100, "0x12")
    await master.connect(electors[1]).ratify([100, 101])
    await master.connect(electors[2]).ratify([100, 101])

    ethers.provider.send("evm_increaseTime", [MIN_DELAY + 1000])
    await expect(master.connect(jabroni).execute([101, 100])).to.be.reverted
  })

  it("execute repeat", async () => {
    await master.connect(electors[0]).propose(101, "0x13")
    await master.connect(electors[0]).propose(100, "0x12")
    await master.connect(electors[1]).ratify([100, 101])
    await master.connect(electors[2]).ratify([100, 101])
    ethers.provider.send("evm_increaseTime", [MIN_DELAY + 1000])
    await master.connect(electors[0]).execute([101, 100])

    await expect(master.connect(electors[0]).execute([100])).to.be.reverted
    await expect(master.connect(electors[0]).execute([101])).to.be.reverted
    await expect(master.connect(electors[1]).execute([100])).to.be.reverted
    await expect(master.connect(electors[1]).execute([101])).to.be.reverted
    await expect(master.connect(electors[3]).execute([100])).to.be.reverted
    await expect(master.connect(electors[3]).execute([101])).to.be.reverted
  })
})