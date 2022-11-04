import { TestLevelBook } from '../typechain/TestLevelBook'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toFixedGrowth, fromFixedGrowth } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockMinion } from '../typechain/MockMinion';
import { CrocPolicy } from '../typechain/CrocPolicy';
import { Wallet, Signer } from 'ethers';

chai.use(solidity);

describe('CrocPolicy', () => {
    let policy: CrocPolicy
    let minion: MockMinion
    let accts: Wallet[]
    let ops: Wallet
    let treasury: Wallet
    let emergency: Wallet

   beforeEach("deploy", async () => {
      accts = (await (ethers.getSigners() as Promise<Signer[]>)) as unknown as Wallet[]
      ops = accts[0]
      treasury = accts[1]
      emergency = accts[2]
      
      let factory = await ethers.getContractFactory("MockMinion");
      minion = (await factory.deploy()) as MockMinion;

      factory = await ethers.getContractFactory("CrocPolicy");
      policy = (await factory.deploy(minion.address, ops.address, treasury.address, emergency.address)) as CrocPolicy;
    })

    it("constructor addresses", async() => {
        expect(await policy.dex_()).to.be.eq(minion.address)
        expect(await policy.opsAuthority_()).to.be.eq(ops.address)
        expect(await policy.treasuryAuthority_()).to.be.eq(treasury.address)
        expect(await policy.emergencyAuthority_()).to.be.eq(emergency.address)
    })

    it("transfer authority", async() => {
        await policy.connect(treasury).transferGovernance(accts[3].address, accts[4].address, accts[5].address)
        expect(await policy.dex_()).to.be.eq(minion.address)
        expect(await policy.opsAuthority_()).to.be.eq(accts[3].address)
        expect(await policy.treasuryAuthority_()).to.be.eq(accts[4].address)
        expect(await policy.emergencyAuthority_()).to.be.eq(accts[5].address)
    })

    it("authority for transfer authority", async() => {
        // Only treasury can transfer authority
        await expect(policy.connect(ops).transferGovernance(accts[3].address, accts[4].address, accts[5].address)).to.be.reverted
        await expect(policy.connect(emergency).transferGovernance(accts[3].address, accts[4].address, accts[5].address)).to.be.reverted
        await expect(policy.connect(accts[3]).transferGovernance(accts[3].address, accts[4].address, accts[5].address)).to.be.reverted
        
        // After authority transfer, old authroity has no power to transfer
        await policy.connect(treasury).transferGovernance(accts[3].address, accts[4].address, accts[5].address)
        await expect(policy.connect(treasury).transferGovernance(accts[3].address, accts[4].address, accts[5].address)).to.be.reverted
    })

    it("ops resolution", async() => {
        // Only treasury can transfer authority
        policy.connect(ops).opsResolution(minion.address, 5, "0x1234")

        expect(await minion.callers_(0)).to.eq(ops.address)
        expect(await minion.protoCmds_(0)).to.eq("0x1234")
        expect(await minion.paths_(0)).to.eq(5)
        expect(await minion.sudos_(0)).to.eq(false)
    })

    it("ops resolution from treasury", async() => {
        // Only treasury can transfer authority
        policy.connect(treasury).opsResolution(minion.address, 5, "0x1234")

        expect(await minion.callers_(0)).to.eq(treasury.address)
        expect(await minion.protoCmds_(0)).to.eq("0x1234")
        expect(await minion.paths_(0)).to.eq(5)
        expect(await minion.sudos_(0)).to.eq(false)
    })

    it("ops resolution from emergency", async() => {
        // Only treasury can transfer authority
        policy.connect(emergency).opsResolution(minion.address, 5, "0x1234")

        expect(await minion.callers_(0)).to.eq(emergency.address)
        expect(await minion.protoCmds_(0)).to.eq("0x1234")
        expect(await minion.paths_(0)).to.eq(5)
        expect(await minion.sudos_(0)).to.eq(false)
    })

    it("ops resolution unauthorized", async() => {
        // Only treasury can transfer authority
        await expect(policy.connect(accts[4]).opsResolution(minion.address, 5, "0x1234")).to.be.reverted
    })

    it("treasury resolution", async() => {
        // Only treasury can transfer authority
        await policy.connect(treasury).treasuryResolution(minion.address, 5, "0x1234", true)
        await policy.connect(treasury).treasuryResolution(minion.address, 5, "0x8796", false)

        expect(await minion.callers_(0)).to.eq(treasury.address)
        expect(await minion.protoCmds_(0)).to.eq("0x1234")
        expect(await minion.protoCmds_(1)).to.eq("0x8796")
        expect(await minion.paths_(0)).to.eq(5)
        expect(await minion.sudos_(0)).to.eq(true)
        expect(await minion.sudos_(1)).to.eq(false)
    })

    it("treasury resolution unauthorized", async() => {
        // Only treasury can transfer authority
        await expect(policy.connect(accts[4]).treasuryResolution(minion.address, 5, "0x1234", false)).to.be.reverted
        await expect(policy.connect(ops).treasuryResolution(minion.address, 5, "0x1234", false)).to.be.reverted
        await expect(policy.connect(emergency).treasuryResolution(minion.address, 5, "0x1234", false)).to.be.reverted
    })

    it("emergency halt", async() => {
        const ADMIN_PROXY = 3
        await policy.connect(emergency).emergencyHalt(minion.address, "test halt")

        let abiCoder = new ethers.utils.AbiCoder()
        let hotPathCmd = abiCoder.encode(["uint8", "bool"], [22, false])
        let safeModeCmd = abiCoder.encode(["uint8", "bool"], [23, true])
        

        expect(await minion.callers_(0)).to.eq(emergency.address)
        expect(await minion.callers_(1)).to.eq(emergency.address)
        expect(await minion.paths_(0)).to.eq(ADMIN_PROXY)
        expect(await minion.paths_(1)).to.eq(ADMIN_PROXY)
        expect(await minion.sudos_(0)).to.eq(true)
        expect(await minion.sudos_(1)).to.eq(true)
        expect(await minion.protoCmds_(0)).to.eq(hotPathCmd)
        expect(await minion.protoCmds_(1)).to.eq(safeModeCmd)
    })

    it("emergency unauthorized", async() => {
        const ADMIN_PROXY = 5
        await expect(policy.connect(treasury).emergencyHalt(minion.address, "test halt")).to.be.reverted
        await expect(policy.connect(ops).emergencyHalt(minion.address, "test halt")).to.be.reverted
        await expect(policy.connect(accts[4]).emergencyHalt(minion.address, "test halt")).to.be.reverted
    })

    it("policy invoke", async() => {
        const PROXY_PATH = 25
        const FLAGS = "0x000000000000000000000000000000000000000000000009"
        const expiry = Math.floor(Date.now() / 1000) + 10000

        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: FLAGS, mandateTime_: 0, expiryOffset_: expiry})

        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "string"], [0, "hello"])

        expect(await policy.connect(accts[4]).invokePolicy(minion.address, PROXY_PATH, cmd))

        expect(await minion.callers_(0)).to.eq(accts[4].address)
        expect(await minion.protoCmds_(0)).to.eq(cmd)
        expect(await minion.paths_(0)).to.eq(PROXY_PATH)
        expect(await minion.sudos_(0)).to.eq(false)
    })

    it("policy invoke flag pos", async() => {
        const PROXY_PATH = 25
        const FLAGS = "0x000000000000000000000000000000000000000000000009"
        const expiry = Math.floor(Date.now() / 1000) + 10000

        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: FLAGS, mandateTime_: 0, expiryOffset_: expiry})

        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "string"], [3, "hello"]) // Corresponds to flag for 0x8 bit

        expect(await policy.connect(accts[4]).invokePolicy(minion.address, PROXY_PATH, cmd))

        expect(await minion.callers_(0)).to.eq(accts[4].address)
        expect(await minion.protoCmds_(0)).to.eq(cmd)
        expect(await minion.paths_(0)).to.eq(PROXY_PATH)
        expect(await minion.sudos_(0)).to.eq(false)
    })

    it("policy non conduit", async() => {
        const PROXY_PATH = 25
        const FLAGS = "0x000000000000000000000000000000000000000000000009"
        const expiry = Math.floor(Date.now() / 1000) + 10000

        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: FLAGS, mandateTime_: 0, expiryOffset_: expiry})

        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "string"], [0, "hello"])

        // Conduit was only set to accts[4]
        await expect(policy.connect(accts[5]).invokePolicy(minion.address, PROXY_PATH, cmd)).to.be.reverted
    })

    it("policy flag off", async() => {
        const PROXY_PATH = 25
        const FLAGS = "0x000000000000000000000000000000000000000000000009"
        const expiry = Math.floor(Date.now() / 1000) + 10000

        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: FLAGS, mandateTime_: 0, expiryOffset_: expiry})

        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "string"], [100, "hello"]) // Flag at bit 100 is not enabled

        await expect(policy.connect(accts[4]).invokePolicy(minion.address, PROXY_PATH, cmd)).to.be.reverted
    })

    it("expired policy", async() => {
        const PROXY_PATH = 25
        const FLAGS = "0x000000000000000000000000000000000000000000000009"
        const expiry = Math.floor(Date.now() / 1000) - 10000 // Expires in past

        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: FLAGS, mandateTime_: 0, expiryOffset_: expiry})

        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "string"], [0, "hello"])

        await expect(policy.connect(accts[4]).invokePolicy(minion.address, PROXY_PATH, cmd)).to.be.reverted
    })

    it("set policy unauthorized", async() => {
        const PROXY_PATH = 25
        const FLAGS = "0x000000000000000000000000000000000000000000000009"
        const expiry = Math.floor(Date.now() / 1000) + 10000

        await expect(policy.connect(accts[5]).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: FLAGS, mandateTime_: 0, expiryOffset_: expiry})).to.be.reverted
    })

    it("policy weaken", async() => {
        const PROXY_PATH = 25
        const FLAGS =      "0x00000000000000000000000000000000000000000000000d"
        const WEAK_FLAGS = "0x000000000000000000000000000000000000000000000005"
        const expiry = Math.floor(Date.now() / 1000) + 10000

        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: FLAGS, mandateTime_: 0, expiryOffset_: expiry})
        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
                { cmdFlags_: WEAK_FLAGS, mandateTime_: 0, expiryOffset_: expiry})

        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "string"], [4, "hello"])

        await expect(policy.connect(accts[4]).invokePolicy(minion.address, PROXY_PATH, cmd)).to.be.reverted
    })

    it("expiry offset", async() => {
        const PROXY_PATH = 25
        const FLAGS =      "0x00000000000000000000000000000000000000000000000d"
        const WEAK_FLAGS = "0x000000000000000000000000000000000000000000000005"
        const expiry = Math.floor(Date.now() / 1000) + 10000

        // Expiry should add the offset to mandate time, therefore this any call should be within the expiry
        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: FLAGS, mandateTime_: expiry, expiryOffset_: 5000})

        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "string"], [2, "hello"])

        expect(await policy.connect(accts[4]).invokePolicy(minion.address, PROXY_PATH, cmd))

        expect(await minion.callers_(0)).to.eq(accts[4].address)
        expect(await minion.protoCmds_(0)).to.eq(cmd)
        expect(await minion.paths_(0)).to.eq(PROXY_PATH)
        expect(await minion.sudos_(0)).to.eq(false)
    })


    it("mandate weaken", async() => {
        const PROXY_PATH = 25
        const FLAGS =      "0x00000000000000000000000000000000000000000000000d"
        const WEAK_FLAGS = "0x000000000000000000000000000000000000000000000005"
        const STRONG_FLAGS = "0x00000000000000000000000000000000000000000000001d"
        const expiry = Math.floor(Date.now() / 1000) + 10000

        // Expiry should add the offset to mandate time, therefore this any call should be within the expiry
        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: FLAGS, mandateTime_: expiry, expiryOffset_: 5000})

        // Reduces the mandate time and therefore weakens the policy
        await expect(policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
                { cmdFlags_: FLAGS, mandateTime_: expiry-1, expiryOffset_: 5001})).to.be.reverted

        // Disalbes flags and therefore weaken
        await expect(policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
                { cmdFlags_: WEAK_FLAGS, mandateTime_: expiry, expiryOffset_: 5000})).to.be.reverted

        // This does not weaken the policy and therefore the mandate time doesn't apply
        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
                { cmdFlags_: STRONG_FLAGS, mandateTime_: expiry, expiryOffset_: 5000})
    })


    it("force weaken flags", async() => {
        const PROXY_PATH = 25
        const FLAGS =      "0x00000000000000000000000000000000000000000000000d"
        const WEAK_FLAGS = "0x000000000000000000000000000000000000000000000005"
        const expiry = Math.floor(Date.now() / 1000) + 10000

        // Expiry should add the offset to mandate time, therefore this any call should be within the expiry
        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: FLAGS, mandateTime_: expiry, expiryOffset_: 5000})

        await policy.connect(treasury).forcePolicy(accts[4].address, PROXY_PATH, 
                { cmdFlags_: WEAK_FLAGS, mandateTime_: expiry, expiryOffset_: 5000})
                
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "string"], [3, "hello"])

        // Flag is disabled
        await expect(policy.connect(accts[4]).invokePolicy(minion.address, PROXY_PATH, cmd)).to.be.reverted
    })

    it("force weaken mandate", async() => {
        const PROXY_PATH = 25
        const FLAGS =      "0x00000000000000000000000000000000000000000000000d"
        const WEAK_FLAGS = "0x000000000000000000000000000000000000000000000005"
        const expiry = Math.floor(Date.now() / 1000) + 10000

        // Expiry should add the offset to mandate time, therefore this any call should be within the expiry
        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: FLAGS, mandateTime_: expiry, expiryOffset_: 5000})

        await policy.connect(treasury).forcePolicy(accts[4].address, PROXY_PATH, 
                { cmdFlags_: FLAGS, mandateTime_: 0, expiryOffset_: expiry})
        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: WEAK_FLAGS, mandateTime_: 0, expiryOffset_: expiry})
                
        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "string"], [3, "hello"])

        // Flag is disabled
        await expect(policy.connect(accts[4]).invokePolicy(minion.address, PROXY_PATH, cmd)).to.be.reverted
    })

    it("force weaken unauthorized", async() => {
        const PROXY_PATH = 25
        const FLAGS =      "0x00000000000000000000000000000000000000000000000d"
        const WEAK_FLAGS = "0x000000000000000000000000000000000000000000000005"
        const expiry = Math.floor(Date.now() / 1000) + 10000

        // Expiry should add the offset to mandate time, therefore this any call should be within the expiry
        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: FLAGS, mandateTime_: expiry, expiryOffset_: 5000})

        await expect(policy.connect(ops).forcePolicy(accts[4].address, PROXY_PATH, 
                { cmdFlags_: FLAGS, mandateTime_: expiry, expiryOffset_: 4000})).to.be.reverted
        await expect(policy.connect(emergency).forcePolicy(accts[4].address, PROXY_PATH, 
                { cmdFlags_: FLAGS, mandateTime_: expiry, expiryOffset_: 4000})).to.be.reverted
        await expect(policy.connect(accts[5]).forcePolicy(accts[4].address, PROXY_PATH, 
                { cmdFlags_: FLAGS, mandateTime_: expiry, expiryOffset_: 4000})).to.be.reverted
    })

    it("emergency policy", async() => {
        const PROXY_PATH = 25
        const FLAGS = "0x000000000000000000000000000000000000000000000009"
        const expiry = Math.floor(Date.now() / 1000) + 10000

        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: FLAGS, mandateTime_: 0, expiryOffset_: expiry})
        await policy.connect(emergency).emergencyReset(accts[4].address, PROXY_PATH, "test")

        let abiCoder = new ethers.utils.AbiCoder()
        let cmd = abiCoder.encode(["uint8", "string"], [0, "hello"])

        await expect(policy.connect(accts[4]).invokePolicy(minion.address, PROXY_PATH, cmd)).to.be.reverted
    })

    it("emergency policy authorized", async() => {
        const PROXY_PATH = 25
        const FLAGS = "0x000000000000000000000000000000000000000000000009"
        const expiry = Math.floor(Date.now() / 1000) + 10000

        await policy.connect(ops).setPolicy(accts[4].address, PROXY_PATH, 
            { cmdFlags_: FLAGS, mandateTime_: 0, expiryOffset_: expiry})

        await expect(policy.connect(ops).emergencyReset(accts[4].address, PROXY_PATH, "test")).to.be.reverted
        await expect(policy.connect(treasury).emergencyReset(accts[4].address, PROXY_PATH, "test")).to.be.reverted
        await expect(policy.connect(accts[5]).emergencyReset(accts[4].address, PROXY_PATH, "test")).to.be.reverted
    })

})