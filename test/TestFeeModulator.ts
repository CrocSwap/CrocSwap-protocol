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
import { BootPath, ColdPath, CrocQuery, FeeModulatorConduit, MockMaster, MockTimelock } from '../typechain';
import { COLD_PROXY_IDX } from './SetupDex';

const hre = require("hardhat");
chai.use(solidity);

describe('Fee Modulator', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    let sender: string
    let other: string
    let policy: CrocPolicy
    let feeModulator: FeeModulatorConduit
    let query: CrocQuery
    let accts: Wallet[]
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
      await pool.connect(await test.auth).protocolCmd(test.COLD_PROXY, transferCmd(policy.address), true)

      factory = await ethers.getContractFactory("CrocQuery");
      query = (await factory.deploy(pool.address)) as CrocQuery;

      test.useHotPath = true

      factory = await ethers.getContractFactory("FeeModulatorConduit");
      feeModulator = (await factory.deploy(policy.address, query.address)) as FeeModulatorConduit;

      const REVISE_POOL_CMD = 111
      await policy.setPolicy(feeModulator.address, COLD_PROXY_IDX, setPolicyCmd(REVISE_POOL_CMD))
    })

    function setPolicyCmd(flagPosition: number, expireTtl: number = 3600, mandateTtl: number = 0) {
      const flag = BigNumber.from(1).shl(flagPosition); // Set the bit at the specified position
      // Convert flag BigNumber to BytesLike
      const flagBytes = ethers.utils.hexZeroPad(flag.toHexString(), 32)

      const currentTime = Math.floor(Date.now() / 1000); // Get current Unix timestamp
      const mandateTime = currentTime + mandateTtl;
      const expireTime = currentTime + expireTtl;

      return {
        cmdFlags_: flagBytes,
        mandateTime_: mandateTime,
        expiryOffset_: expireTime
      }
    }

    function transferCmd (auth: string): BytesLike {
      let abiCoder = new ethers.utils.AbiCoder()
      return  abiCoder.encode(["uint8", "address"],
          [20, auth])
    }

    it(`verify addresses`, async () => {
      expect(await feeModulator.policy_()).to.eq(policy.address)
      expect(await feeModulator.dex_()).to.eq(pool.address)
      expect(await feeModulator.query_()).to.eq(query.address)

      expect(await feeModulator.delegators_(accts[0].address)).to.be.true
    })

    it(`non permissioned delegator`, async () => {
      await expect(feeModulator.connect(accts[1]).addDelegate(accts[2].address)).to.be.reverted
      await expect(feeModulator.connect(accts[1]).removeDelegate(accts[2].address)).to.be.reverted
      await expect(feeModulator.connect(accts[1]).addUniversalModulator(accts[2].address)).to.be.reverted
      await expect(feeModulator.connect(accts[1]).removeUniversalModulator(accts[2].address)).to.be.reverted
      await expect(feeModulator.connect(accts[1]).addPoolModulator(accts[2].address, test.base.address, test.quote.address, test.poolIdx)).to.be.reverted
      await expect(feeModulator.connect(accts[1]).addPoolModulator(accts[2].address, test.base.address, test.quote.address, test.poolIdx)).to.be.reverted
    })

    it(`add delegate`, async () => {
      await feeModulator.addDelegate(accts[1].address)
      expect(await feeModulator.delegators_(accts[1].address)).to.be.true
    })

    it(`remove delegate`, async () => {
      await feeModulator.addDelegate(accts[1].address)
      await feeModulator.removeDelegate(accts[1].address)
      expect(await feeModulator.delegators_(accts[1].address)).to.be.false
    })

    it('delegate powers', async () => {
      await feeModulator.addDelegate(accts[1].address)

      await feeModulator.connect(accts[1]).addUniversalModulator(accts[2].address)
      expect(await feeModulator.universalModulators_(accts[2].address)).to.be.true

      await feeModulator.connect(accts[1]).addPoolModulator(accts[2].address, test.base.address, test.quote.address, test.poolIdx)
      expect(await feeModulator.isPoolModulator(accts[2].address, test.base.address, test.quote.address, test.poolIdx)).to.be.true
    })

    it(`add universal modulator`, async () => {
      await feeModulator.addDelegate(accts[1].address)
      await feeModulator.addUniversalModulator(accts[2].address)
      expect(await feeModulator.universalModulators_(accts[2].address)).to.be.true
    })

    it(`remove universal modulator`, async () => {
      await feeModulator.addDelegate(accts[1].address)
      await feeModulator.addUniversalModulator(accts[2].address)
      await feeModulator.removeUniversalModulator(accts[2].address)
      expect(await feeModulator.universalModulators_(accts[2].address)).to.be.false
    })

    it(`add pool modulator`, async () => {
      await feeModulator.addDelegate(accts[1].address)
      await feeModulator.connect(accts[1]).addPoolModulator(accts[2].address, test.base.address, test.quote.address, test.poolIdx)
      expect(await feeModulator.isPoolModulator(accts[2].address, test.base.address, test.quote.address, test.poolIdx)).to.be.true
    })

    it(`remove pool modulator`, async () => {
      await feeModulator.addDelegate(accts[1].address)
      await feeModulator.connect(accts[1]).addPoolModulator(accts[2].address, test.base.address, test.quote.address, test.poolIdx)
      await feeModulator.connect(accts[1]).removePoolModulator(accts[2].address, test.base.address, test.quote.address, test.poolIdx)
      expect(await feeModulator.isPoolModulator(accts[2].address, test.base.address, test.quote.address, test.poolIdx)).to.be.false
    })

    it(`change fee universal modulator`, async () => {
      await feeModulator.addUniversalModulator(accts[2].address)
      await feeModulator.connect(accts[2]).changeFeeUnivMod(test.base.address, test.quote.address, test.poolIdx, 100)
      let params = await query.queryPoolParams(test.base.address, test.quote.address, test.poolIdx)
      expect(params.feeRate_).to.eq(100)
    })

    it(`change fee multiple`, async () => {
      await feeModulator.addUniversalModulator(accts[2].address)
      await feeModulator.connect(accts[2]).changeFeeUnivMod(test.base.address, test.quote.address, test.poolIdx, 100)
      let params = await query.queryPoolParams(test.base.address, test.quote.address, test.poolIdx)
      expect(params.feeRate_).to.eq(100)

      await feeModulator.connect(accts[2]).changeFeeUnivMod(test.base.address, test.quote.address, test.poolIdx, 115)
      params = await query.queryPoolParams(test.base.address, test.quote.address, test.poolIdx)
      expect(params.feeRate_).to.eq(115)

      await feeModulator.connect(accts[2]).changeFeeUnivMod(test.base.address, test.quote.address, test.poolIdx, 95)
      params = await query.queryPoolParams(test.base.address, test.quote.address, test.poolIdx)
      expect(params.feeRate_).to.eq(95)
    })

    it(`change fee pool modulator`, async () => {
      await feeModulator.addPoolModulator(accts[2].address, test.base.address, test.quote.address, test.poolIdx)
      await feeModulator.connect(accts[2]).changeFeePoolMod(test.base.address, test.quote.address, test.poolIdx, 100)
      let params = await query.queryPoolParams(test.base.address, test.quote.address, test.poolIdx)
      expect(params.feeRate_).to.eq(100)
    })

    it(`universal modulator not authorized`, async () => {
      await feeModulator.addUniversalModulator(accts[2].address)
      await expect(feeModulator.connect(accts[1]).changeFeeUnivMod(test.base.address, test.quote.address, test.poolIdx, 100)).to.be.reverted
    })

    it(`pool modulator not authorized`, async () => {
      await feeModulator.addPoolModulator(accts[2].address, test.base.address, test.quote.address, test.poolIdx)
      await expect(feeModulator.connect(accts[1]).changeFeePoolMod(test.base.address, test.quote.address, test.poolIdx, 100)).to.be.reverted

      // Authorized but on different pools
      await feeModulator.addPoolModulator(accts[2].address, test.base.address, test.quote.address, 5000)
      await feeModulator.addPoolModulator(accts[2].address, test.quote.address, test.quote.address, 5000)
      await expect(feeModulator.connect(accts[2]).changeFeePoolMod(test.base.address, test.quote.address, 5000, 100)).to.be.reverted
    })
  })
