import { TestPool, makeTokenPool, Token, createWbera } from './FacadePool'
import "@nomiclabs/hardhat-ethers";
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { CrocQuery, WBERA } from '../typechain';
import { parseUnits } from 'ethers/lib/utils';
import { getCrocErc20LpAddress } from '../misc/utils/getCrocErc20LpAddress';
import { BigNumber } from 'ethers';

chai.use(solidity);

describe('Test Single Step init pool & mint liqudity PRICE = 1', () => {
  let test: TestPool
  let baseToken: Token
  let quoteToken: Token
  const feeRate = 225 * 100
  let trader: string
  let query: CrocQuery
  let wbera: WBERA

  before(async () => {
    wbera = await createWbera()
  })

  beforeEach("deploy", async () => {
    test = await makeTokenPool(wbera)
  })

  it("deploy & add liquidity via single step price = 1", async () => {
    baseToken = await test.base
    quoteToken = await test.quote

    const price = 1
    const slippage = 0.01
    const initPoolCallData = await test.initPoolCalldata(feeRate, 0, 1, price)

    const dexWithSigner = await (await test.dex).connect((await test.trader))
    await dexWithSigner['userCmd(uint16,bytes)'](initPoolCallData.pathId, initPoolCallData.calldata)

    const priceLimits = {
      min: price * (1 - (slippage ?? 1) / 100),
      max: price * (1 + (slippage ?? 1) / 100),
    };

    const limits = await test.transformLimits([priceLimits.min, priceLimits.max])
    const initialLiquidity = BigNumber.from('1').pow(18)

    const mintCalldata = await test.encodeWarmPath(
      test.base.address,
      test.quote.address,
      31,
      0,
      0,
      initialLiquidity,
      limits[0],
      limits[1],
      0,
      await getCrocErc20LpAddress(baseToken.address, quoteToken.address, (await test.dex).address)
    )

    await dexWithSigner['userCmd(uint16,bytes)'](test.WARM_PROXY, mintCalldata)
  })

  it("deploy & add liquidity via single step price = 0.001", async () => {
    baseToken = await test.base
    quoteToken = await test.quote

    const price = 0.001
    const slippage = 0.01
    const initPoolCallData = await test.initPoolCalldata(feeRate, 0, 1, price)

    const dexWithSigner = await (await test.dex).connect((await test.trader))
    await dexWithSigner['userCmd(uint16,bytes)'](initPoolCallData.pathId, initPoolCallData.calldata)

    const priceLimits = {
      min: price * (1 - (slippage ?? 1) / 100),
      max: price * (1 + (slippage ?? 1) / 100),
    };

    const limits = await test.transformLimits([priceLimits.min, priceLimits.max])
    const initialLiquidity = BigNumber.from('1').pow(18)

    const mintCalldata = await test.encodeWarmPath(
      test.base.address,
      test.quote.address,
      31,
      0,
      0,
      initialLiquidity,
      limits[0],
      limits[1],
      0,
      await getCrocErc20LpAddress(baseToken.address, quoteToken.address, (await test.dex).address)
    )

    await dexWithSigner['userCmd(uint16,bytes)'](test.WARM_PROXY, mintCalldata)
  })

  it("deploy & add liquidity via single step price = 5", async () => {
    baseToken = await test.base
    quoteToken = await test.quote

    const price = 5
    const slippage = 0.01
    const initPoolCallData = await test.initPoolCalldata(feeRate, 0, 1, price)

    const dexWithSigner = await (await test.dex).connect((await test.trader))
    await dexWithSigner['userCmd(uint16,bytes)'](initPoolCallData.pathId, initPoolCallData.calldata)

    const priceLimits = {
      min: price * (1 - (slippage ?? 1) / 100),
      max: price * (1 + (slippage ?? 1) / 100),
    };

    const limits = await test.transformLimits([priceLimits.min, priceLimits.max])
    const initialLiquidity = BigNumber.from('1').pow(18)

    const mintCalldata = await test.encodeWarmPath(
      test.base.address,
      test.quote.address,
      31,
      0,
      0,
      initialLiquidity,
      limits[0],
      limits[1],
      0,
      await getCrocErc20LpAddress(baseToken.address, quoteToken.address, (await test.dex).address)
    )

    await dexWithSigner['userCmd(uint16,bytes)'](test.WARM_PROXY, mintCalldata)
  })
})

