import { TestAgentMask } from '../typechain/TestAgentMask'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { ZERO_ADDR } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { TestAgentMaskRouter } from '../typechain/TestAgentMaskRouter';
import { Signer, BigNumber, Wallet } from 'ethers';

chai.use(solidity);

describe('AgentMask', () => {
    let agent: TestAgentMask
    let router: TestAgentMaskRouter
    let accts: Wallet[]
    let addrs: string[]

   beforeEach("deploy", async () => {
      let factory = await ethers.getContractFactory("TestAgentMask");
      agent = (await factory.deploy()) as TestAgentMask;

      factory = await ethers.getContractFactory("TestAgentMaskRouter");
      router = (await factory.deploy(agent.address)) as TestAgentMaskRouter;

      accts = (await (ethers.getSigners() as Promise<Signer[]>)) as unknown as Wallet[]
      addrs = await Promise.all(accts.map(a => a.getAddress()))
      
      await agent.setNonce(addrs[0], 2048, 100)
   })

    it("pass relay cond", async() => {
        await router
            .testRelayConds(addrs[0], false, false, 2048, 100, ZERO_ADDR)
        expect(await agent.getNonce(addrs[0], 2048)).to.be.eq(101)
    })

    it("pass relayer origin", async() => {
        await router
            .connect(accts[1])
            .testRelayConds(addrs[0], false, false, 2048, 100, addrs[1])
        expect(await agent.getNonce(addrs[0], 2048)).to.be.eq(101)
    })

    it("pass relayer origin", async() => {
        await router
            .connect(accts[1])
            .testRelayConds(addrs[0], false, false, 2048, 100, router.address)
        expect(await agent.getNonce(addrs[0], 2048)).to.be.eq(101)
    })

    it("fail relayer address", async() => {
        await expect(router
            .connect(accts[2])
            .testRelayConds(addrs[0], false, false, 2048, 100, addrs[1])).to.be.reverted
    })

    it("fail deadline", async() => {
        expect(router.testRelayConds(addrs[0], true, false, 2048, 100, ZERO_ADDR)).to.be.reverted
    })

    it("fail alive", async() => {
        expect(router.testRelayConds(addrs[0], false, true, 2048, 100, ZERO_ADDR)).to.be.reverted
    })

    it("fail nonce early", async() => {
        expect(router.testRelayConds(addrs[0], false, true, 2048, 99, ZERO_ADDR)).to.be.reverted
    })

    it("fail nonce late", async() => {
        expect(router.testRelayConds(addrs[0], false, true, 2048, 99, ZERO_ADDR)).to.be.reverted
    })

    it("fail nonce salt", async() => {
        expect(router.testRelayConds(addrs[0], false, true, 1024, 100, ZERO_ADDR)).to.be.reverted
    })

    it("repeat nonce cond", async() => {
        await router
            .testRelayConds(addrs[0], false, false, 2048, 100, ZERO_ADDR)
        await router
            .testRelayConds(addrs[0], false, false, 2048, 101, ZERO_ADDR)
        await router
            .testRelayConds(addrs[0], false, false, 2048, 102, ZERO_ADDR)
        await router
            .testRelayConds(addrs[0], false, false, 2048, 103, ZERO_ADDR)
        await router
            .testRelayConds(addrs[0], false, false, 2048, 104, ZERO_ADDR)
        
        expect(await agent.getNonce(addrs[0], 2048)).to.be.eq(105)
    })

    it("signature", async() => {
        let callpath = 10
        let cmd = "0x0ab3e5"
        let conds = "0x5912bbcc"
        let tip = "0x6492"

        const domain = {
            name: "CrocSwap",
            chainId: 31337,
            verifyingContract: agent.address
        }

        const types = {
            CrocRelayerCall: [
                { name: "callpath", type: "uint8"},
                { name: "cmd", type: "bytes" },
                { name: "conds", type: "bytes" },
                { name: "tip", type: "bytes" }
            ]
        }

        const value = {
            callpath: callpath,
            cmd: cmd,
            conds: conds,
            tip: tip
        }
          
        const signature = (await accts[1]._signTypedData(domain, types, value)).substring(2)
        const r = "0x" + signature.substring(0, 64);
        const s = "0x" + signature.substring(64, 128);
        const v = parseInt(signature.substring(128, 130), 16);

        let abiCoder = new ethers.utils.AbiCoder()
        const sig = abiCoder.encode(["uint8", "bytes32", "bytes32"], [v, r, s])
        await agent.testVerifySignature(callpath, cmd, conds, tip, sig)
        expect(await agent.signer_()).to.be.eq(addrs[1])

        // Make sure contract reverts on an invalid signature (flip r and s...)
        const badSig = abiCoder.encode(["uint8", "bytes32", "bytes32"],  [200, r, s])
        await expect(agent.testVerifySignature(callpath, cmd, conds, tip, badSig)).to.be.reverted
    })
})