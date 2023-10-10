import { TestPool, makeTokenPool, Token, makeEtherPool, NativeEther } from '../test/FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, ZERO_ADDR, MAX_PRICE } from '../test/FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber, Wallet, Signer, BytesLike, ContractFactory } from 'ethers';
import { CrocPolicy } from '../typechain/CrocPolicy';
import { CrocSwapDex } from '../typechain/CrocSwapDex';
import { BootPath, ColdPath, MockMaster, MockTimelock } from '../typechain';

const hre = require("hardhat");
chai.use(solidity);

describe('Pool Governance', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    let sender: string
    let other: string
    let policy: CrocPolicy
    let policy2: CrocPolicy
    let accts: Wallet[]
    let ops: MockTimelock
    let ops2: MockTimelock
    let treasury: MockTimelock
    let treasury2: MockTimelock
    let emergency: MockTimelock
    let emergency2: MockTimelock
    let pool: CrocSwapDex
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
      test = await makeTokenPool()
      baseToken = await test.base
      quoteToken = await test.quote
      sender = await (await test.trader).getAddress() 
      other = await (await test.other).getAddress() 

      await test.initPool(feeRate, 0, 1, 1.5)

      accts = (await (ethers.getSigners() as Promise<Signer[]>)) as unknown as Wallet[]

      let factory = await ethers.getContractFactory("CrocPolicy");
      policy = (await factory.deploy((await test.dex).address)) as CrocPolicy;
      policy2 = (await factory.deploy((await test.dex).address)) as CrocPolicy;
      pool = await test.dex

      factory = await ethers.getContractFactory("MockTimelock");
      ops = (await factory.deploy(policy.address)) as MockTimelock;
      emergency = (await factory.deploy(policy.address)) as MockTimelock;
      treasury = (await factory.deploy(policy.address)) as MockTimelock;
      await policy.transferGovernance(ops.address, treasury.address, emergency.address)

      ops2 = (await factory.deploy(policy2.address)) as MockTimelock;
      emergency2 = (await factory.deploy(policy2.address)) as MockTimelock;
      treasury2 = (await factory.deploy(policy2.address)) as MockTimelock;
      await policy2.transferGovernance(ops2.address, treasury2.address, emergency2.address)

      test.useHotPath = true
    })

    function transferCmd (auth: string): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return  abiCoder.encode(["uint8", "address"],
          [20, auth])
    }

    function collectCmd(): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return  abiCoder.encode(["uint8", "address"],
          [40, baseToken.address])
    }

    function treasurySetCmd (recv: string): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return  abiCoder.encode(["uint8", "address"],
          [41, recv])
    }

    function safeModeCmd (onMode: boolean): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return  abiCoder.encode(["uint8", "bool"],
          [23, onMode])
    }

    function disburseCmd (recv: string, value: number): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return  abiCoder.encode(["uint8", "address", "int128", "address"],
          [74, recv, value, baseToken.address])
    }

    function setInitLiqCmd (value: number): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return  abiCoder.encode(["uint8", "uint128"],
          [112, value])
    }

    it("transfer authority", async() => {
      // Doesn't have dex authority
      await expect(pool.connect(await test.other).protocolCmd(test.COLD_PROXY, transferCmd(policy.address), true)).to.be.reverted

      // Sudo not used in call
      await expect(pool.connect(await test.auth).protocolCmd(test.COLD_PROXY, transferCmd(policy.address), false)).to.be.reverted

      // Successful transfer
      await pool.connect(await test.auth).protocolCmd(test.COLD_PROXY, transferCmd(policy.address), true)

      // Authority has been transfered away...
      await expect(pool.connect(await test.auth).protocolCmd(test.COLD_PROXY, transferCmd(policy.address), true)).to.be.reverted

      // Insufficient policy authority to transfer authority
      await expect(ops.opsResolution(pool.address, test.COLD_PROXY, transferCmd(policy2.address))).to.be.reverted
      await expect(ops.treasuryResolution(pool.address, test.COLD_PROXY, transferCmd(policy2.address), true)).to.be.reverted
      await expect(treasury.treasuryResolution(pool.address, test.COLD_PROXY, transferCmd(policy2.address), false)).to.be.reverted

      // Cannot transfer authority to EOA addresses or contracts that don't explicitly accept authority role
      await expect(treasury.treasuryResolution(pool.address, test.COLD_PROXY, transferCmd(accts[5].address), true)).to.be.reverted
      await expect(treasury.treasuryResolution(pool.address, test.COLD_PROXY, transferCmd(baseToken.address), true)).to.be.reverted

      // Successul transfer
      await treasury.treasuryResolution(pool.address, test.COLD_PROXY, transferCmd(policy2.address), true)

      // If worked, should be able to transfer back
      await treasury2.treasuryResolution(pool.address, test.COLD_PROXY, transferCmd(policy.address), true)
    })


    it("set treasury", async() => {
      await test.testRevisePool(feeRate, 128, 1) // Turn on protocol fee
      await pool.connect(await test.auth).protocolCmd(test.COLD_PROXY, transferCmd(policy.address), true)
      await test.testMintAmbient(10000)
      await test.testSwap(true, false, 100000, MAX_PRICE)

      // Unauthorized attempts to set treasury
      await expect(pool.protocolCmd(test.COLD_PROXY, treasurySetCmd(policy2.address), true)).to.be.reverted
      await expect(ops.opsResolution(pool.address, test.COLD_PROXY, treasurySetCmd(policy2.address))).to.be.reverted
      await expect(ops.treasuryResolution(pool.address, test.COLD_PROXY, treasurySetCmd(policy2.address), true)).to.be.reverted

      // Treasury set to zero or non-contract addresses
      await expect(treasury.treasuryResolution(pool.address, test.COLD_PROXY, treasurySetCmd(ZERO_ADDR), true)).to.be.reverted
      await expect(treasury.treasuryResolution(pool.address, test.COLD_PROXY, treasurySetCmd(accts[5].address), true)).to.be.reverted

      // Success call
      await treasury.treasuryResolution(pool.address, test.COLD_PROXY, treasurySetCmd(policy2.address), true)
    })

    
    it("collect treasury", async() => {
      await test.testRevisePool(feeRate, 128, 1) // Turn on protocol fee
      await pool.connect(await test.auth).protocolCmd(test.COLD_PROXY, transferCmd(policy.address), true)
      await test.testMintAmbient(10000)
      await test.testSwap(true, false, 100000, MAX_PRICE)

      await treasury.treasuryResolution(pool.address, test.COLD_PROXY, treasurySetCmd(policy2.address), true)
      await hre.ethers.provider.send("evm_increaseTime", [3600*24*7+1]) // 7 days

      // Unauthorized attempts to collect treasury
      await expect(pool.protocolCmd(test.COLD_PROXY, collectCmd(), true)).to.be.reverted
      await expect(ops.opsResolution(pool.address, test.COLD_PROXY, collectCmd())).to.be.reverted
      await expect(ops.treasuryResolution(pool.address, test.COLD_PROXY, collectCmd(), true)).to.be.reverted

      // Successful treasury payout
      let snap = await (await test.query).querySurplus(policy2.address, baseToken.address)
      await treasury.treasuryResolution(pool.address, test.COLD_PROXY, collectCmd(), true)
      expect(await (await test.query).querySurplus(policy2.address, baseToken.address)).to.gt(snap);
    })

    it("collect treasury time delay", async() => {
      await test.testRevisePool(feeRate, 128, 1) // Turn on protocol fee
      await pool.connect(await test.auth).protocolCmd(test.COLD_PROXY, transferCmd(policy.address), true)
      await test.testMintAmbient(10000)
      await test.testSwap(true, false, 100000, MAX_PRICE)

      await treasury.treasuryResolution(pool.address, test.COLD_PROXY, treasurySetCmd(policy2.address), true)

      // Will fail because treasury can only be collected 7 days after treasury address is set
      await expect(treasury.treasuryResolution(pool.address, test.COLD_PROXY, collectCmd(), true)).to.be.reverted
      await hre.ethers.provider.send("evm_increaseTime", [3600*24*6]) // 6 days
      await expect(treasury.treasuryResolution(pool.address, test.COLD_PROXY, collectCmd(), true)).to.be.reverted      
      await hre.ethers.provider.send("evm_increaseTime", [3600*24+1]) // One more day... treasury valid

      // Successful treasury payout
      let snap = await (await test.query).querySurplus(policy2.address, baseToken.address)
      await treasury.treasuryResolution(pool.address, test.COLD_PROXY, collectCmd(), true)
      expect(await (await test.query).querySurplus(policy2.address, baseToken.address)).to.gt(snap);
    })


    it("safe mode", async() => {
      await test.testRevisePool(feeRate, 128, 1) // Turn on protocol fee
      await test.testMintAmbient(10000)
      await pool.connect(await test.auth).protocolCmd(test.COLD_PROXY, transferCmd(policy.address), true)

      // Unauthorized attempts to turn on safe mode
      await expect(pool.protocolCmd(test.COLD_PROXY, safeModeCmd(true), true)).to.be.reverted
      await expect(ops.opsResolution(pool.address, test.COLD_PROXY, safeModeCmd(true))).to.be.reverted
      await expect(ops.treasuryResolution(pool.address, test.COLD_PROXY, safeModeCmd(true), false)).to.be.reverted

      // Turn on safe mode
      await treasury.treasuryResolution(pool.address, test.COLD_PROXY, safeModeCmd(true), true)

      // Safe mode disables everything outside the safe mode path
      await expect(test.testMintAmbient(10000)).to.be.reverted
      await expect(pool.userCmd(test.COLD_PROXY, disburseCmd(accts[6].address, 10000))).to.be.reverted
      await expect(treasury.treasuryResolution(pool.address, test.COLD_PROXY, treasurySetCmd(accts[5].address), false)).to.be.reverted
      await expect(treasury.treasuryResolution(pool.address, test.COLD_PROXY, collectCmd(), true)).to.be.reverted
      await expect(ops.opsResolution(pool.address, test.COLD_PROXY, setInitLiqCmd(1000))).to.be.reverted

      // Non-sudo and user commands to the Emergency call path will fail
      await expect(pool.userCmd(test.EMERGENCY_PROXY, disburseCmd(accts[6].address, 10000))).to.be.reverted
      await expect(treasury.treasuryResolution(pool.address, test.EMERGENCY_PROXY, treasurySetCmd(accts[5].address), false)).to.be.reverted
      await expect(treasury.treasuryResolution(pool.address, test.EMERGENCY_PROXY, collectCmd(), false)).to.be.reverted
      await expect(ops.treasuryResolution(pool.address, test.EMERGENCY_PROXY, setInitLiqCmd(1000), false)).to.be.reverted

      // Safe mode can be disabled on the emergency callpath
      await treasury.treasuryResolution(pool.address, test.EMERGENCY_PROXY, safeModeCmd(false), true)

      // And regular operation resumes
      await expect(test.testMintAmbient(10000)).to.not.be.reverted
    })


    it("init liq valid bounds", async() => {
      // Init liquidity must be above 0 and below 10 million
      await expect(test.testSetInitLiq(0)).to.be.reverted
      await expect(test.testSetInitLiq(10*1000*1000)).to.be.reverted
      await expect(test.testSetInitLiq(9*1000*1000)).to.be.not.reverted      
    })

    it("take rate", async() => {
      // Take rate must be below 50% (128/256)
      await expect(test.initPoolIdx(1000, feeRate, 129, 1, 1.0)).to.be.reverted
      await expect(test.initPoolIdx(1000, feeRate, 128, 1, 1.0)).to.be.not.reverted
    })

  })