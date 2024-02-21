import { TestPool, makeTokenPool, Token, createWbera, makeMultiswap } from './FacadePool'
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import chai, { expect } from "chai";
import { CrocQuery, WBERA } from '../typechain';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { getCrocErc20LpAddress } from '../misc/utils/getCrocErc20LpAddress';
import { BigNumber } from 'ethers';
import { BeraCrocMultiSwap } from '../contracts/typechain';

chai.use(solidity);

describe.only('Test Multiswap With Preview', () => {
  let test: TestPool
  let baseToken: Token
  let quoteToken: Token
  const feeRate = 225 * 100
  let trader: string
  let query: CrocQuery
  let wbera: WBERA
  let multiswap: BeraCrocMultiSwap

  before(async () => {
    wbera = await createWbera()
  })

  beforeEach("deploy", async () => {
    test = await makeTokenPool(wbera)
    multiswap = await makeMultiswap((await test.dex).address)
  })

  it("deploy & add liquidity & multiswap with preview ISBUY TRUE", async () => {
    baseToken = await test.base
    quoteToken = await test.quote

    const price = 0.01
    const slippage = 0.1

    const initPoolCallData = await test.initPoolCalldata(feeRate, 0, 1, price)

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

    const multipathArgs = [2, initPoolCallData.pathId, initPoolCallData.calldata, test.WARM_PROXY, mintCalldata]

    let abiCoder = new ethers.utils.AbiCoder()

    const multiCmd = abiCoder.encode(
      ["uint8", "uint8", "bytes", "uint8", "bytes"],
      multipathArgs as any[5],
    );

    const dexWithSigner = await (await test.dex).connect((await test.trader))
    await dexWithSigner['userCmd(uint16,bytes)'](test.MULTI_PROXY, multiCmd)

    const multiswapWithSigner = await multiswap.connect((await test.trader))

    //approve multiswap contract

    await baseToken.fund(await test.trader, multiswap.address, BigNumber.from('100'))
    await quoteToken.fund(await test.trader, multiswap.address, BigNumber.from('100'))

    // const args = [36000,baseToken.address,quoteToken.address,true] as any

    const args = [{
        poolIdx: test.poolIdx,
        base: baseToken.address,
        quote: quoteToken.address,
        isBuy: true
    }]

    const amount = parseEther('1')

    const previewAmount = await multiswapWithSigner.previewMultiSwap([...args], amount)

    console.log('previewAmount', previewAmount.toString())
    expect(previewAmount).to.be.gt(BigNumber.from('0'))
    expect(previewAmount).to.not.equal(BigNumber.from('340282366920938463463374607431768211448'))

    // await multiswapWithSigner.multiSwap([...args], amount, previewAmount)
  })

  it("deploy & add liquidity & multiswap with preview ISBUY FALSE", async () => {
    baseToken = await test.base
    quoteToken = await test.quote

    const price = 0.01
    const slippage = 0.1

    const initPoolCallData = await test.initPoolCalldata(feeRate, 0, 1, price)

    const priceLimits = {
      min: price * (1 - (slippage ?? 1) / 100),
      max: price * (1 + (slippage ?? 1) / 100),
    };

    const limits = await test.transformLimits([priceLimits.min, priceLimits.max])
    const initialLiquidity = BigNumber.from('10').pow(18)

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

    const multipathArgs = [2, initPoolCallData.pathId, initPoolCallData.calldata, test.WARM_PROXY, mintCalldata]

    let abiCoder = new ethers.utils.AbiCoder()

    const multiCmd = abiCoder.encode(
      ["uint8", "uint8", "bytes", "uint8", "bytes"],
      multipathArgs as any[5],
    );

    const dexWithSigner = await (await test.dex).connect((await test.trader))
    await dexWithSigner['userCmd(uint16,bytes)'](test.MULTI_PROXY, multiCmd)
    const multiswapWithSigner = await multiswap.connect((await test.trader))

    //approve multiswap contract

    await baseToken.fund(await test.trader, multiswap.address, BigNumber.from('100'))
    await quoteToken.fund(await test.trader, multiswap.address, BigNumber.from('100'))

    // const args = [36000,baseToken.address,quoteToken.address,true] as any

    const args = [{
        poolIdx: test.poolIdx,
        base: baseToken.address,
        quote: quoteToken.address,
        isBuy: false
    }]

    const amount = parseEther('9')

    const previewAmount = await multiswapWithSigner.previewMultiSwap([...args], amount)

    console.log('previewAmount', previewAmount.toString())
    expect(previewAmount).to.be.gt(BigNumber.from('0'))
    expect(previewAmount).to.not.equal(BigNumber.from('340282366920938463463374607431768211448'))

    // await multiswapWithSigner.multiSwap([...args], amount, previewAmount)
  })
})
