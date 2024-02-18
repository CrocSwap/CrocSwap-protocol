import { TestPool, Token, createWbera, makeWberaPool } from './FacadePool'
import "@nomiclabs/hardhat-ethers";
import { ZERO_ADDR } from './FixedPoint';
import { solidity } from "ethereum-waffle";
import chai from "chai";
import { WBERA } from '../typechain';
import { getCrocErc20LpAddress } from '../misc/utils/getCrocErc20LpAddress';
import { BigNumber } from 'ethers';

chai.use(solidity);

describe.only('Testing WBERA Pools', () => {
    let test: TestPool
    let baseToken: Token
    let quoteToken: Token
    const feeRate = 225 * 100
    let wbera: WBERA

    before(async () => {
        wbera = await createWbera()
        console.log("wbera", wbera.address)
    })

    beforeEach("deploy", async () => {
        test = await makeWberaPool(wbera)
    })

    it("deploy & add liquidity with a WBERA Pool", async () => {
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
    it("Add liquidity to a WBERA Pool with native BERA", async () => {

        const price = 1
        const slippage = 0.1
        const priceLimits = {
            min: price * (1 - (slippage ?? 1) / 100),
            max: price * (1 + (slippage ?? 1) / 100),
        };
        const limits = await test.transformLimits([priceLimits.min, priceLimits.max])
        const initialLiquidity = BigNumber.from('10').pow(18)

        // console.log("baseToken", test.base.address)
        // console.log("quoteToken", test.quote.address)

        const baseTokenAddress = test.base.address === wbera.address ? ZERO_ADDR : test.base.address
        const quoteTokenAddress = test.quote.address === wbera.address ? ZERO_ADDR : test.quote.address
        // console.log("baseToken", baseTokenAddress)
        // console.log("quoteToken", quoteTokenAddress)

        // this is minting based on the base token. There is an edge case here where the native token is not always
        // the base token due to the sorting. Maybe if thats the case we should swap the callpath to be mintquote
        // instead of mint base
        const mintCalldata = await test.encodeWarmPath(
            baseTokenAddress,
            quoteTokenAddress,
            32, // mint base callpath
            0,
            0,
            initialLiquidity,
            limits[0],
            limits[1],
            0,
            await getCrocErc20LpAddress(baseTokenAddress, quoteTokenAddress, (await test.dex).address)
        )
        const dexWithSigner = await (await test.dex).connect((await test.trader))

        await dexWithSigner['userCmd(uint16,bytes)'](test.WARM_PROXY, mintCalldata, {
            value: initialLiquidity
        })
    })

})

