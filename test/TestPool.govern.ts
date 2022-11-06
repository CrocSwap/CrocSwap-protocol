import { TestPool, makeTokenPool, Token, makeEtherPool, NativeEther } from './FacadePool'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { toSqrtPrice, fromSqrtPrice, maxSqrtPrice, minSqrtPrice, ZERO_ADDR, MAX_PRICE } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { MockERC20 } from '../typechain/MockERC20';
import { BigNumber, Wallet, Signer, BytesLike, ContractFactory } from 'ethers';
import { CrocPolicy } from '../typechain/CrocPolicy';
import { CrocSwapDex } from '../typechain/CrocSwapDex';
import { BootPath, ColdPath, MockTimelock } from '../typechain';

chai.use(solidity);

describe('Pool Governance', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    let sender: string
    let other: string
    let policy: CrocPolicy
    let accts: Wallet[]
    let ops: MockTimelock
    let treasury: MockTimelock
    let emergency: MockTimelock
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
      pool = await test.dex

      factory = await ethers.getContractFactory("MockTimelock");
      ops = (await factory.deploy(policy.address)) as MockTimelock;
      emergency = (await factory.deploy(policy.address)) as MockTimelock;
      treasury = (await factory.deploy(policy.address)) as MockTimelock;
      await policy.transferGovernance(ops.address, treasury.address, emergency.address)

      test.useHotPath = true
    })

    function transferCmd (auth: string): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return  abiCoder.encode(["uint8", "address"],
          [20, auth])
    }

    function collectCmd (recv: string): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return  abiCoder.encode(["uint8", "address", "address"],
          [40, recv, baseToken.address])
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
      await expect(ops.opsResolution(pool.address, test.COLD_PROXY, transferCmd(accts[0].address))).to.be.reverted
      await expect(ops.treasuryResolution(pool.address, test.COLD_PROXY, transferCmd(accts[0].address), true)).to.be.reverted
      await expect(treasury.treasuryResolution(pool.address, test.COLD_PROXY, transferCmd(accts[0].address), false)).to.be.reverted

      // Successul transfer
      await treasury.treasuryResolution(pool.address, test.COLD_PROXY, transferCmd(accts[0].address), true)

      // If worked, should be able to transfer back
      await pool.connect(accts[0]).protocolCmd(test.COLD_PROXY, transferCmd(policy.address), true)
    })


    it("collect treasury", async() => {
      await test.testRevisePool(feeRate, 128, 1) // Turn on protocol fee
      await pool.connect(await test.auth).protocolCmd(test.COLD_PROXY, transferCmd(policy.address), true)
      await test.testMintAmbient(10000)
      await test.testSwap(true, false, 100000, MAX_PRICE)

      // Unauthorized attempts to collect treasury
      await expect(pool.protocolCmd(test.COLD_PROXY, collectCmd(accts[5].address), true)).to.be.reverted
      await expect(ops.opsResolution(pool.address, test.COLD_PROXY, collectCmd(accts[5].address))).to.be.reverted
      await expect(ops.treasuryResolution(pool.address, test.COLD_PROXY, collectCmd(accts[5].address), true)).to.be.reverted

      // Successful treasury collection
      await treasury.treasuryResolution(pool.address, test.COLD_PROXY, collectCmd(accts[5].address), true)
      await pool.connect(accts[5]).userCmd(test.COLD_PROXY, disburseCmd(accts[5].address, 1000))
      expect(await baseToken.balanceOf(accts[5].address)).to.eq(1000)
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
      await expect(treasury.treasuryResolution(pool.address, test.COLD_PROXY, collectCmd(accts[5].address), true)).to.be.reverted
      await expect(ops.opsResolution(pool.address, test.COLD_PROXY, setInitLiqCmd(1000))).to.be.reverted

      // Non-sudo and user commands to the Emergency call path will fail
      await expect(pool.userCmd(test.EMERGENCY_PROXY, disburseCmd(accts[6].address, 10000))).to.be.reverted
      await expect(treasury.treasuryResolution(pool.address, test.COLD_PROXY, collectCmd(accts[5].address), true)).to.be.reverted
      await expect(ops.treasuryResolution(pool.address, test.EMERGENCY_PROXY, setInitLiqCmd(1000), false)).to.be.reverted

      // Safe mode can be disabled on the emergency callpath
      await treasury.treasuryResolution(pool.address, test.EMERGENCY_PROXY, safeModeCmd(false), true)

      // And regular operation resumes
      await expect(test.testMintAmbient(10000)).to.not.be.reverted
    })

  })