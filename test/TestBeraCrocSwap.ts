import { TestPool, makeTokenPool, Token, createWbera, makeMultiswap } from './FacadePool'
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { CrocQuery, WBERA } from '../typechain';
import { parseEther, parseUnits } from 'ethers/lib/utils';
import { getCrocErc20LpAddress } from '../misc/utils/getCrocErc20LpAddress';
import { BigNumber } from 'ethers';
import { BeraCrocMultiSwap } from '../contracts/typechain';

chai.use(solidity);

describe.only('Test Multiswap', () => {
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

  it("deploy & add liquidity via multipath price = 1", async () => {
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

    await dexWithSigner['userCmd(uint16,bytes)'](test.WARM_PROXY, mintCalldata)

    await baseToken.fund(await test.trader, (await test.dex).address, BigNumber.from('100'))
    await quoteToken.fund(await test.trader, (await test.dex).address, BigNumber.from('100'))
    await dexWithSigner.swap(baseToken.address, quoteToken.address, 3600, true, true, parseEther('1'), 0, BigNumber.from('340282366920938463463374607431768211455'), 0 , 2)
  })
})
