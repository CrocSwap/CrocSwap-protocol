import { TestPool, makeTokenPool, Token, createWbera } from './FacadePool'
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { CrocQuery, WBERA } from '../typechain';
import { parseUnits } from 'ethers/lib/utils';
import { getCrocErc20LpAddress } from '../misc/utils/getCrocErc20LpAddress';

chai.use(solidity);

describe('Test Multpath init pool & mint liqudity PRICE = 1', () => {
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

  it("deploy & add liquidity via multipath price = 1", async () => {
    baseToken = await test.wberaToken
    quoteToken = await test.quote

    const price = 1
    const slippage = 0.1

    const initPoolCallData = await test.initPoolCalldata(feeRate, 0, 1, price)

    const priceLimits = {
      min: price * (1 - (slippage ?? 1) / 100),
      max: price * (1 + (slippage ?? 1) / 100),
    };

    const limits = await test.transformLimits([priceLimits.min, priceLimits.max])
    const initialLiquidity = parseUnits('1', 18)

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
  })
})
