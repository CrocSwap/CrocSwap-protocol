import { MockUniswapPool } from '../typechain/MockUniswapPool'
import { TestPool, makeTokenPool, Token } from './FacadePool'
import { FeeOracle } from '../typechain/FeeOracle'
import { expect } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from 'hardhat';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { CrocSwapDex } from '../typechain/CrocSwapDex';
import { BigNumber } from 'ethers';
import { toSqrtPrice, fromSqrtPrice } from './FixedPoint';

chai.use(solidity);

describe('FeeOracle', () => {
  let pool: TestPool
  let baseToken: Token
  let quoteToken: Token
  let dex: CrocSwapDex
  let oracle: FeeOracle
  let uniswapPool: MockUniswapPool

  beforeEach("deploy",  async () => {
    pool = await makeTokenPool()
    baseToken = await pool.base
    quoteToken = await pool.quote
    dex = await pool.dex
    const libFactory = await ethers.getContractFactory("FeeOracle")
    oracle = (await libFactory.deploy(20*100, 40*100, dex.address, baseToken.address, quoteToken.address, 0, baseToken.address, baseToken.address)) as FeeOracle

    const libFactoryUniswapV3Pool = await ethers.getContractFactory("MockUniswapPool")
    uniswapPool = (await libFactoryUniswapV3Pool.deploy()) as MockUniswapPool
  })

  it("convert to fixed-point", async() => {
    let result = await oracle.convQ64(1)
    expect(result).to.equal(BigNumber.from("18446744073709551616"))

    result = await oracle.convQ64(100)
    expect(result).to.equal(BigNumber.from("1844674407370955161600"))

    result = await oracle.convQ64(BigNumber.from("18943200985232094"))
    expect(result).to.equal(BigNumber.from("349440380511419069395163086432763904"))
  })

  it("convert from fixed-point", async() => {
    let result = await oracle.deconvQ64(BigNumber.from("18446744073709551616"))
    expect(result).to.equal(1)

    result = await oracle.deconvQ64(BigNumber.from("1844674407370955161600"))
    expect(result).to.equal(100)

    result = await oracle.deconvQ64(BigNumber.from("349440380511419069395163086432763904"))
    expect(result).to.equal(BigNumber.from("18943200985232094"))
  })

  it("multiply fixed-point numbers", async() => {
    let result = await oracle.mulQ64(await oracle.convQ64(10), await oracle.convQ64(10))
    expect(result).to.equal(BigNumber.from("34028236692093846346337460743176821145600"))

    result = await oracle.deconvQ64(await oracle.convQ128toQ64(result))
    expect(result).to.equal(10 * 10)

    result = await oracle.mulQ64(await oracle.convQ64(89421), await oracle.convQ64(984281))
    expect(result).to.equal(BigNumber.from("29950085677376857391870607755054341789632750944256"))

    result = await oracle.deconvQ64(await oracle.convQ128toQ64(result))
    expect(result).to.equal(89421 * 984281)
  })

  it("divide fixed-point numbers", async() => {
    let result = await oracle.divQ64(await oracle.convQ64(150), await oracle.convQ64(3))
    expect(result).to.equal(await oracle.convQ64(50))

    result = await oracle.deconvQ64(result)
    expect(result).to.equal(150 / 3)

    result = await oracle.divQ64(await oracle.convQ64(12995), await oracle.convQ64(15))
    expect(result).to.equal(BigNumber.from("15981029282523708216661"))

    result = await oracle.deconvQ64(result)
    expect(result).to.equal(866)

    result = await oracle.divQ64(await oracle.convQ64(1), await oracle.convQ64(100))
    expect(result).to.equal(BigNumber.from("184467440737095516"))

    result = await oracle.deconvQ64(result)
    expect(result).to.equal(0)
  })

  it("retrieve uniswap pool data", async() => {
    /*await uniswapPool.setPriceSqrt(101092)
    await uniswapPool.setTick(910239)
    let result = await oracle.getUniswapSqrtPriceAndTick(await uniswapPool)
    expect(result.priceSqrt).to.equal(101092)
    expect(result.tick).to.equal(910239)*/
  })

  it("calculate dynamic fee with token 0 in", async() => {
    let result = await oracle.calculateDynamicFeeToken0In(130, 135, 115)
    expect(result).to.equal(20 * 100)

    result = await oracle.calculateDynamicFeeToken0In(130, 135, 50)
    expect(result).to.equal(25 * 100)

    result = await oracle.calculateDynamicFeeToken0In(130, 0, 50)
    expect(result).to.equal(85 * 100)
  })

  it("calculate dynamic fee with token 1 in", async() => {
    let result = await oracle.calculateDynamicFeeToken1In(130, 125, 145)
    expect(result).to.equal(20 * 100)

    result = await oracle.calculateDynamicFeeToken1In(130, 125, 210)
    expect(result).to.equal(25 * 100)

    result = await oracle.calculateDynamicFeeToken1In(130, 260, 210)
    expect(result).to.equal(85 * 100)
  })

  it("adjust token input for fee", async() => {
    let result = await oracle.adjustTokenInForFee(100, 0)
    expect(result).to.equal(100)

    result = await oracle.adjustTokenInForFee(100, 1000000)
    expect(result).to.equal(0)

    result = await oracle.adjustTokenInForFee(100, 500000)
    expect(result).to.equal(50)

    result = await oracle.adjustTokenInForFee(100, 10000)
    expect(result).to.equal(99)
  })

  it("estimate new price after token 0 swap in", async() => {
    let result = await oracle.deconvQ64(await oracle.estimateSqrtPriceToken0In(9310981, await oracle.convQ64(3919), BigNumber.from("840921213981"), 30 * 100))
    expect(result).to.equal(3756)

    result = await oracle.deconvQ64(await oracle.estimateSqrtPriceToken0In(BigNumber.from("523993832024809303"), await oracle.convQ64(21), BigNumber.from("1901320909483092828"), 5 * 100))
    expect(result).to.equal(3)

    result = await oracle.deconvQ64(await oracle.estimateSqrtPriceToken0In(100000000, await oracle.convQ64(3919), BigNumber.from("840921213981"), 30 * 100))
    expect(result).to.equal(2675)
  })

  it("estimate new price after token 1 swap in", async() => {
    let result = await oracle.deconvQ64(await oracle.estimateSqrtPriceToken1In(BigNumber.from("523993832024809303"), await oracle.convQ64(3919), BigNumber.from("840921213981"), 30 * 100))
    expect(result).to.equal(625168)


    result = await oracle.deconvQ64(await oracle.estimateSqrtPriceToken1In(BigNumber.from("839803983283"), await oracle.convQ64(21), BigNumber.from("13092828"), 5 * 100))
    expect(result).to.equal(64131)
  })

  it("calculate difference of square-rooted prices", async() => {
    let result = await oracle.calculateSqrtPriceDifference(await oracle.convQ64(12345), await oracle.convQ64(12345))
    expect(result).to.closeTo(0, 0)

    result = await oracle.calculateSqrtPriceDifference(await oracle.convQ64(12345), await oracle.convQ64(0))
    expect(result).to.closeTo(1000000, 0)

    result = await oracle.calculateSqrtPriceDifference(await oracle.convQ64(10), await oracle.convQ64(12))
    expect(result).to.closeTo((12 ** 2 - 10 ** 2) / (10 ** 2) * 1000000, 100)

    result = await oracle.calculateSqrtPriceDifference(await oracle.convQ64(15), await oracle.convQ64(7))
    expect(result).to.closeTo((15 ** 2 - 7 ** 2) / (15 ** 2) * 1000000, 100)

    result = await oracle.calculateSqrtPriceDifference(await oracle.divQ64(await oracle.convQ64(1), await oracle.convQ64(2)), await oracle.divQ64(await oracle.convQ64(3), await oracle.convQ64(4)))
    expect(result).to.closeTo((0.75 ** 2 - 0.5 ** 2) / (0.5 ** 2) * 1000000, 100)
  })

  it("calculate price difference with ticks", async() => {
    let result = await oracle.estimatePriceDifferenceWithTicks(4981, 5025)
    expect(result).to.equal((5025 - 4981) * 100)

    result = await oracle.estimatePriceDifferenceWithTicks(0, 25)
    expect(result).to.equal((25 - 0) * 100)
  })

  it("calculate slippage with token 0 swap in", async() => {
    let result = await oracle.estimateSlippageToken0In(9310981, await oracle.convQ64(3919), BigNumber.from("840921213981"), 30 * 100)
    expect(result).to.closeTo(1000000 * (3919 ** 2 - 3756 ** 2) / (3919 ** 2), 500)

    result = await oracle.estimateSlippageToken0In(BigNumber.from("523993832024809303"), await oracle.convQ64(21), BigNumber.from("1901320909483092828"), 5 * 100)
    expect(result).to.closeTo(1000000 * (21 ** 2 - 3 ** 2) / (21 ** 2), 2000)

    result = await oracle.estimateSlippageToken0In(100000000, await oracle.convQ64(3919), BigNumber.from("840921213981"), 30 * 100)
    expect(result).to.closeTo(1000000 * (3919 ** 2 - 2675 ** 2) / (3919 ** 2), 2000)
  })

  it("calculate slippage with token 1 swap in", async() => {
    let result = await oracle.estimateSlippageToken1In(100000000, await oracle.convQ64(21), 13092828, 5 * 100)
    expect(result).to.closeTo(1000000 * (28.634 ** 2 - 21 ** 2) / (21 ** 2), 100)
    
    result = await oracle.estimateSlippageToken1In(110000000, await oracle.convQ64(21), 13092828, 5 * 100)
    expect(result).to.closeTo(1000000 * (29.397 ** 2 - 21 ** 2) / (21 ** 2), 100)
  })
})