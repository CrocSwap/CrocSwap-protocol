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
import { BootPath, ColdPath, MockBlast, MockBlastPoints, MockERC20Rebasint, MockMaster, MockTimelock } from '../typechain';
import { BLAST_PROXY_PATH } from './SetupDex';

const hre = require("hardhat");
chai.use(solidity);

describe('Blast Extensions', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    let sender: string
    let other: string
    let pool: CrocSwapDex
    let blast: MockBlast
    let erc20Rebase: MockERC20Rebasint
    let points: MockBlastPoints
    const feeRate = 225 * 100

    beforeEach("deploy",  async () => {
      test = await makeTokenPool()
      baseToken = await test.base
      quoteToken = await test.quote
      sender = await (await test.trader).getAddress() 
      other = await (await test.other).getAddress() 

      await test.initPool(feeRate, 0, 1, 1.5)

      let factory = await ethers.getContractFactory("MockBlast");
      blast = (await factory.deploy()) as MockBlast;

      factory = await ethers.getContractFactory("MockERC20Rebasint");
      erc20Rebase = (await factory.deploy()) as MockERC20Rebasint;

      factory = await ethers.getContractFactory("MockBlastPoints");
      points = (await factory.deploy()) as MockBlastPoints;  
      
      pool = await test.dex
    })

    function configBlastYield (blast: string): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return abiCoder.encode(["uint256", "address"], [182355, blast])
    }

    function configErc20Yield (token: string): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return abiCoder.encode(["uint256", "address"], [182356, token])
    }

    function configPointsTestnet (key: string): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return abiCoder.encode(["uint256", "address"], [182352, key])
    }

    function configPointsMainnet (key: string): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return abiCoder.encode(["uint256", "address"], [182351, key])
    }

    function configPointsAt (points: string, key: string): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return abiCoder.encode(["uint256", "address", "address"], [182353, points, key])
    }

    function collectYield (recv: string, amt: number, gasAmt: number, gasSecs: number): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return abiCoder.encode(["uint256", "address", "address", "uint256", "uint256", "uint256"], 
        [179, blast.address, recv, amt, gasAmt, gasSecs])
    }

    function collectErc20 (recv: string, token: string, amt: number): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return abiCoder.encode(["uint256", "address", "address", "uint256"], [177, recv, token, amt])
    }

    it("config yield", async() => {
      await pool.connect(await test.other).userCmd(BLAST_PROXY_PATH, configBlastYield(blast.address))

      expect(await blast.isYieldConfigured_()).to.be.true
      expect(await blast.isGasConfigured_()).to.be.true
    })

    it("config erc20", async() => {
      await pool.connect(await test.other).userCmd(BLAST_PROXY_PATH, configErc20Yield(erc20Rebase.address))

      expect(await erc20Rebase.isYieldConfigured_()).to.be.true
    })

    it("config points", async() => {
      const key = await (await test.third).getAddress()
      await pool.connect(await test.auth).protocolCmd(BLAST_PROXY_PATH, configPointsAt(points.address, key), true)

      expect(await points.operatorKey_()).to.equal(key)
    })

    it("config points auth only", async() => {
      const key = await (await test.third).getAddress()
      await expect(pool.connect(await test.trader).protocolCmd
        (BLAST_PROXY_PATH, configPointsAt(points.address, key), true)).to.be.reverted
    })

    it("config points sudo only", async() => {
      const key = await (await test.third).getAddress()
      await expect(pool.connect(await test.auth).protocolCmd
        (BLAST_PROXY_PATH, configPointsAt(points.address, key), false)).to.be.reverted
    })

    it("config points no user command", async() => {
      const key = await (await test.third).getAddress()
      await expect(pool.connect(await test.auth).userCmd
        (BLAST_PROXY_PATH, configPointsAt(points.address, key))).to.be.reverted
    })

    it("claim erc20", async() => {
      const claimAmount = 1024

      await pool.connect(await test.auth).protocolCmd(BLAST_PROXY_PATH, 
        collectErc20(sender, erc20Rebase.address, claimAmount), false)
      
      expect(await erc20Rebase.claimRecv_()).to.equal(sender)
      expect(await erc20Rebase.claimAmount_()).to.equal(claimAmount)
    })

    it("claim erc20 auth only", async() => {
      const claimAmount = 1024

      await expect(pool.connect(await test.other).protocolCmd(BLAST_PROXY_PATH, 
        collectErc20(sender, erc20Rebase.address, claimAmount), false)).to.be.reverted
    })

    it("claim erc20 not a token", async() => {
      const claimAmount = 1024

      await expect(pool.connect(await test.auth).protocolCmd(BLAST_PROXY_PATH, 
        collectErc20(sender, blast.address, claimAmount), false)).to.be.reverted
    })

    it("claim erc20 no user command", async() => {
      const claimAmount = 1024

      await expect(pool.connect(await test.auth).userCmd(BLAST_PROXY_PATH, 
        collectErc20(sender, erc20Rebase.address, claimAmount))).to.be.reverted
    })

    it("claim yield", async() => {
      const claimAmount = 1024
      const gasAmount = 5000
      const gasSeconds = 3600

      await pool.connect(await test.auth).protocolCmd(BLAST_PROXY_PATH, 
        collectYield(sender, claimAmount, gasAmount, gasSeconds), false)
      
      expect(await blast.claimContract_()).to.equal(pool.address)
      expect(await blast.claimRecv_()).to.equal(sender)
      expect(await blast.claimAmount_()).to.equal(claimAmount)

      expect(await blast.gasClaimContract_()).to.equal(pool.address)
      expect(await blast.gasClaimRecv_()).to.equal(sender)
      expect(await blast.gasClaimAmount_()).to.equal(gasAmount)
      expect(await blast.gasClaimsSeconds_()).to.equal(gasSeconds)
    })

    it("claim yield (zero gas)", async() => {
      const claimAmount = 1024
      const gasAmount = 0
      const gasSeconds = 3600

      await pool.connect(await test.auth).protocolCmd(BLAST_PROXY_PATH, 
        collectYield(sender, claimAmount, gasAmount, gasSeconds), false)
      
      expect(await blast.claimContract_()).to.equal(pool.address)
      expect(await blast.claimRecv_()).to.equal(sender)
      expect(await blast.claimAmount_()).to.equal(claimAmount)

      expect(await blast.gasClaimContract_()).to.equal(ethers.constants.AddressZero)
      expect(await blast.gasClaimRecv_()).to.equal(ethers.constants.AddressZero)
      expect(await blast.gasClaimAmount_()).to.equal(0)
      expect(await blast.gasClaimsSeconds_()).to.equal(0)
    })

    it("claim yield (zero yield)", async() => {
      const claimAmount = 0
      const gasAmount = 5000
      const gasSeconds = 3600

      await pool.connect(await test.auth).protocolCmd(BLAST_PROXY_PATH, 
        collectYield(sender, claimAmount, gasAmount, gasSeconds), false)
      
      expect(await blast.claimContract_()).to.equal(ethers.constants.AddressZero)
      expect(await blast.claimRecv_()).to.equal(ethers.constants.AddressZero)
      expect(await blast.claimAmount_()).to.equal(0)

      expect(await blast.gasClaimContract_()).to.equal(pool.address)
      expect(await blast.gasClaimRecv_()).to.equal(sender)
      expect(await blast.gasClaimAmount_()).to.equal(gasAmount)
      expect(await blast.gasClaimsSeconds_()).to.equal(gasSeconds)
    })

    it("claim yield auth only", async() => {
      const claimAmount = 1024
      const gasAmount = 5000
      const gasSeconds = 3600

      await expect(pool.connect(await test.other).protocolCmd(BLAST_PROXY_PATH, 
        collectYield(sender, claimAmount, gasAmount, gasSeconds), false)).to.be.reverted
    })

    it("claim yield no user command", async() => {
      const claimAmount = 1024
      const gasAmount = 5000
      const gasSeconds = 3600

      await expect(pool.connect(await test.auth).userCmd(BLAST_PROXY_PATH, 
        collectYield(sender, claimAmount, gasAmount, gasSeconds))).to.be.reverted
    })
  })