import { TestAgentMask } from '../typechain/TestAgentMask'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import chai from "chai";

chai.use(solidity);

describe('AgentMask', () => {
    let test: TestAgentMask
    const notMagic = "0x5A7B000000000000000000000000000000000000"
    const notMagic2 = "0x9c8f005ab27AdB94f3d49020A15722Db2Fcd9F27"
    
    const magicBase = "0xCC00000000000000000000000000000000000000"
    const originKey = "0xCC10000000000000000000000000000000000000"
    const joinKey = "0xCC20000000000000000000000000000000000000"
    const bothKey = "0xCC30000000000000000000000000000000000000"
    const creditOrigin = "0xCC40000000000000000000000000000000000000"
    const debitOrigin = "0xCC80000000000000000000000000000000000000"
    const settleOrigin = "0xCCC0000000000000000000000000000000000000"
    const allOrigin = "0xCCF0000000000000000000000000000000000000"
    

   beforeEach("deploy TestBitmapsLib", async () => {
      const factory = await ethers.getContractFactory("TestAgentMask");
      test = (await factory.deploy()) as TestAgentMask;
   })

   it("from origin key", async() => {
       expect(await test.testAgentMintKey(notMagic, notMagic)).to.equal(await test.addressToNum(notMagic))
       expect(await test.testAgentMintKey(magicBase, magicBase)).to.equal(await test.addressToNum(magicBase))
       expect(await test.testAgentMintKey(notMagic2, notMagic2)).to.equal(await test.addressToNum(notMagic2))
       expect(await test.testAgentMintKey(allOrigin, allOrigin)).to.equal(await test.addressToNum(allOrigin))
       expect(await test.testAgentBurnKey(notMagic, notMagic)).to.equal(await test.addressToNum(notMagic))
       expect(await test.testAgentBurnKey(magicBase, magicBase)).to.equal(await test.addressToNum(magicBase))
       expect(await test.testAgentBurnKey(notMagic2, notMagic2)).to.equal(await test.addressToNum(notMagic2))
       expect(await test.testAgentBurnKey(allOrigin, allOrigin)).to.equal(await test.addressToNum(allOrigin))
    })

    it("from origin settle", async() => {
        let result = await test.testAgentSettle(notMagic, notMagic)
        expect(result[0]).to.equal(await test.addressToNum(notMagic))
        expect(result[1]).to.equal(await test.addressToNum(notMagic))

        result = await test.testAgentSettle(magicBase, magicBase)
        expect(result[0]).to.equal(await test.addressToNum(magicBase))
        expect(result[1]).to.equal(await test.addressToNum(magicBase))

        result = await test.testAgentSettle(allOrigin, allOrigin)
        expect(result[0]).to.equal(await test.addressToNum(allOrigin))
        expect(result[1]).to.equal(await test.addressToNum(allOrigin))
    })

    it("non magic router key", async() => {
        expect(await test.testAgentMintKey(notMagic, notMagic2)).to.equal(await test.addressToNum(notMagic))
        expect(await test.testAgentMintKey(notMagic, magicBase)).to.equal(await test.addressToNum(notMagic))
        expect(await test.testAgentMintKey(notMagic, allOrigin)).to.equal(await test.addressToNum(notMagic))
        expect(await test.testAgentMintKey(notMagic, originKey)).to.equal(await test.addressToNum(notMagic))
        expect(await test.testAgentMintKey(notMagic, joinKey)).to.equal(await test.addressToNum(notMagic))
        expect(await test.testAgentBurnKey(notMagic, notMagic2)).to.equal(await test.addressToNum(notMagic))
        expect(await test.testAgentBurnKey(notMagic, magicBase)).to.equal(await test.addressToNum(notMagic))
        expect(await test.testAgentBurnKey(notMagic, allOrigin)).to.equal(await test.addressToNum(notMagic))
        expect(await test.testAgentBurnKey(notMagic, originKey)).to.equal(await test.addressToNum(notMagic))
        expect(await test.testAgentBurnKey(notMagic, joinKey)).to.equal(await test.addressToNum(notMagic))
     })

     it("non magic router settle", async() => {
        let result = await test.testAgentSettle(notMagic, notMagic2)
        expect(result[0]).to.equal(await test.addressToNum(notMagic))
        expect(result[1]).to.equal(await test.addressToNum(notMagic))

        result = await test.testAgentSettle(notMagic, magicBase)
        expect(result[0]).to.equal(await test.addressToNum(notMagic))
        expect(result[1]).to.equal(await test.addressToNum(notMagic))

        result = await test.testAgentSettle(notMagic, allOrigin)
        expect(result[0]).to.equal(await test.addressToNum(notMagic))
        expect(result[1]).to.equal(await test.addressToNum(notMagic))

        result = await test.testAgentSettle(notMagic, creditOrigin)
        expect(result[0]).to.equal(await test.addressToNum(notMagic))
        expect(result[1]).to.equal(await test.addressToNum(notMagic))

        result = await test.testAgentSettle(notMagic, debitOrigin)
        expect(result[0]).to.equal(await test.addressToNum(notMagic))
        expect(result[1]).to.equal(await test.addressToNum(notMagic))
    })

    it("magic router key", async() => {
        expect(await test.testAgentMintKey(magicBase, notMagic)).to.equal(await test.addressToNum(magicBase))
        expect(await test.testAgentMintKey(originKey, notMagic)).to.equal(await test.addressToNum(notMagic))
        expect(await test.testAgentMintKey(joinKey, notMagic)).to.equal(await test.joinKey(joinKey, notMagic))
        // If both are set join key takes precedence
        expect(await test.testAgentMintKey(bothKey, notMagic)).to.equal(await test.joinKey(bothKey, notMagic))
        expect(await test.testAgentMintKey(allOrigin, notMagic)).to.equal(await test.joinKey(allOrigin, notMagic))
        expect(await test.testAgentMintKey(debitOrigin, notMagic)).to.equal(await test.addressToNum(debitOrigin))

        expect(await test.testAgentBurnKey(magicBase, notMagic)).to.equal(await test.addressToNum(magicBase))
        expect(await test.testAgentBurnKey(joinKey, notMagic)).to.equal(await test.joinKey(joinKey, notMagic))
        expect(await test.testAgentBurnKey(bothKey, notMagic)).to.equal(await test.joinKey(bothKey, notMagic))
        expect(await test.testAgentBurnKey(allOrigin, notMagic)).to.equal(await test.joinKey(allOrigin, notMagic))
        expect(await test.testAgentBurnKey(debitOrigin, notMagic)).to.equal(await test.addressToNum(debitOrigin))

        // Needs to be approved
        await expect(test.testAgentBurnKey(originKey, notMagic)).to.be.reverted

        // Not approved for the correct tx.origin
        await test.testApprove(originKey, notMagic2, true, true)
        await expect(test.testAgentBurnKey(originKey, notMagic)).to.be.reverted

        // Not approved for the correct msg.sender
        await test.testApprove(allOrigin, notMagic, true, true)
        await expect(test.testAgentBurnKey(originKey, notMagic)).to.be.reverted

        // Not approved for burn
        await test.testApprove(allOrigin, notMagic, true, false)
        await expect(test.testAgentBurnKey(originKey, notMagic)).to.be.reverted

        // Finally approved correctly
        await test.testApprove(allOrigin, notMagic, true, true)
        expect(await test.testAgentMintKey(originKey, notMagic)).to.equal(await test.addressToNum(notMagic))
    })

    it("magic settle", async() => {
        let result = await test.testAgentSettle(magicBase, notMagic)
        expect(result[0]).to.equal(await test.addressToNum(magicBase))
        expect(result[1]).to.equal(await test.addressToNum(magicBase))

        // Magic enabled, but none of the settle flags are on.
        result = await test.testAgentSettle(bothKey, notMagic)
        expect(result[0]).to.equal(await test.addressToNum(bothKey))
        expect(result[1]).to.equal(await test.addressToNum(bothKey))

        // Only credit flag is on. Debit will still go to msg.value, but credit to tx.origin 
        result = await test.testAgentSettle(creditOrigin, notMagic)
        expect(result[0]).to.equal(await test.addressToNum(creditOrigin))
        expect(result[1]).to.equal(await test.addressToNum(notMagic))

        expect(test.testAgentSettle(debitOrigin, notMagic)).to.be.reverted
        expect(test.testAgentSettle(settleOrigin, notMagic)).to.be.reverted
        expect(test.testAgentSettle(allOrigin, notMagic)).to.be.reverted

       // Not approved for the correct tx.origin
       await test.testApprove(debitOrigin, notMagic2, true, true)
       await expect(test.testAgentSettle(debitOrigin, notMagic)).to.be.reverted

       // Not approved for the correct msg.sender
       await test.testApprove(creditOrigin, notMagic, true, true)
       await expect(test.testAgentSettle(debitOrigin, notMagic)).to.be.reverted

       // Not approved for burn
       await test.testApprove(debitOrigin, notMagic, false, true)
       await expect(test.testAgentSettle(debitOrigin, notMagic)).to.be.reverted

       // Finally approved correctly
       await test.testApprove(debitOrigin, notMagic, true, true)
       result = await test.testAgentSettle(debitOrigin, notMagic)
       expect(result[0]).to.equal(await test.addressToNum(notMagic))
       expect(result[1]).to.equal(await test.addressToNum(debitOrigin)) 

       await test.testApprove(settleOrigin, notMagic, true, true)
       result = await test.testAgentSettle(settleOrigin, notMagic)
       expect(result[0]).to.equal(await test.addressToNum(notMagic))
       expect(result[1]).to.equal(await test.addressToNum(notMagic))
    })
})