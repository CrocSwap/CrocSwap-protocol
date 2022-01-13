
import { CrocSwapDexSeed } from '../../typechain/CrocSwapDexSeed';
import { ethers } from 'hardhat';
import { ContractFactory, BytesLike, BigNumber } from 'ethers';
import { JsonRpcProvider } from '@ethersproject/providers';
import { toSqrtPrice, fromSqrtPrice, MIN_PRICE, MAX_PRICE } from '../../test/FixedPoint';
import { MockERC20 } from '../../typechain/MockERC20';
import { QueryHelper } from '../../typechain/QueryHelper';
import { CrocSwapDex } from '../../typechain/CrocSwapDex';
import { IERC20Minimal } from '../../typechain/IERC20Minimal';

/* Helper script for deploying a basic mock setup to a localhost or test network.
 * Only for ad-hoc testing purposes. Do NOT use in production. */

const POOL_IDX = 35000
const POOL_IDX_2 = 212

const FEE_RATE = 30 * 100
const FEE_RATE_2 = 5 * 100
const BIG_QTY = BigNumber.from("1000000000000000")

export const ZERO_ADDR = "0x0000000000000000000000000000000000000000"

function encodeProtocolCmd (code: number, token: string, sidecar: string, poolIdx: number, 
    feeRate: number, protoTake: number, ticks: number, value: number): BytesLike {
    let abiCoder = new ethers.utils.AbiCoder()
    return abiCoder.encode(
        [ "uint8", "address", "address", "uint24", "uint24", "uint8", "uint16", "uint128" ], 
        [ code, token, sidecar, poolIdx, feeRate, protoTake, ticks, value ]);
}

function encodeMintAmbient (base: string, quote: string,
    liq: BigNumber | number, useSurplus: boolean): BytesLike {
    let abiCoder = new ethers.utils.AbiCoder()
    const callCode = 3
    return abiCoder.encode(
        [ "uint8", "address", "address", "uint24", "int24", "int24", "uint128", "uint128", "uint128", "bool" ], 
        [ callCode, base, quote, POOL_IDX, 0, 0, liq, MIN_PRICE, MAX_PRICE, useSurplus  ]);
}

function encodeBurnAmbient (base: string, quote: string,
    liq: BigNumber | number, useSurplus: boolean): BytesLike {
    let abiCoder = new ethers.utils.AbiCoder()
    const callCode = 4
    return abiCoder.encode(
        [ "uint8", "address", "address", "uint24", "int24", "int24", "uint128", "uint128", "uint128", "bool" ], 
        [ callCode, base, quote, POOL_IDX, 0, 0, liq, MIN_PRICE, MAX_PRICE, useSurplus  ]);
}

async function describeCurve (query: QueryHelper, base: string, quote: string) {
    let liq = await query.queryLiquidity(base, quote, POOL_IDX)
    let curve = await query.queryCurve(base, quote, POOL_IDX)
    let weiPrice = fromSqrtPrice(curve.priceRoot_)
    let baseDeflator = await tokenDeflator(base)
    let quoteDeflator = await tokenDeflator(quote)
    console.log(curve.priceRoot_.toString())
    console.log(weiPrice)
    console.log("Deflators " + baseDeflator.toString() + " " + quoteDeflator.toString())
    let price = weiPrice * (quoteDeflator / baseDeflator)
    console.log("Liquidity " + liq.toString() + " at price " + price.toString())
}

async function tokenDeflator (token: string): Promise<number> {
    if (token === ZERO_ADDR) {
        return 1e18
    } else {
        let factory = await ethers.getContractFactory("MockERC20")
        let tracker = factory.attach(token) as MockERC20
        let decimals = await tracker.decimals()
        console.log("Decimals " + decimals.toString())
        return Math.pow(10.0, decimals)
    }
}

let override = { gasPrice: BigNumber.from("10").pow(9).mul(3), gasLimit: 6000000 }

async function deploy() {
    let authority = (await ethers.getSigners())[0]
    /*let lp = (await ethers.getSigners())[1]
    let trader = (await ethers.getSigners())[2]*/

    // Just do everything from one account for Ropsten
    let lp = authority
    let trader = authority

    console.log("Deploying with the following addresses...")
    console.log("Protocol Authority: ", await authority.address)
    console.log("Liquidity Provider: ", await lp.address);
    
    /*let factory = await ethers.getContractFactory("ColdPath")
    let tx = await factory.deploy(override)

    let coldPath = (await factory.deploy(override)).address

    factory = await ethers.getContractFactory("WarmPath")
    let warmPath = (await factory.deploy(override)).address

    factory = await ethers.getContractFactory("LongPath")
    let longPath = (await factory.deploy(override)).address

    factory = await ethers.getContractFactory("MicroPaths")
    let microPath = (await factory.deploy(override)).address*/

    let factory = await ethers.getContractFactory("CrocSwapDex");
    /*let dex = await factory.deploy(authority.getAddress(), 
        coldPath, warmPath, longPath, microPath, override) as CrocSwapDexSeed*/
    //let dex = factory.attach("0x141E224f461a85006b2EF051a7C1c290E449202A") as CrocSwapDex
    let dex = factory.attach("0xB6Ff2e53408f38A5a363586746d1dB306AF5caa4") as CrocSwapDex

    //factory = await ethers.getContractFactory("MockERC20")
    /*let base = await factory.deploy(override) as MockERC20
    let quote = await factory.deploy(override) as MockERC20
    if( base.address > quote.address) {
        let holder = base
        base = quote
        quote = holder
    }*/

    //let base = factory.attach("0x66B5b7f1F5604FC33aF247D59a7938369B37358F")
    //let quote = factory.attach("0x6c53969F9273560F393a8BcbFA40906E7B51b1B2")
    /*let base = factory.attach("0x10e13e6DE3BD3A5D2e0361F56a695EB08731E40B") as MockERC20
    let quote = factory.attach("0x788C030D0ac6cd3902Da1Bcc3C6945b8be6f3BA2") as MockERC20

    console.log("Mock Base Token created: " + base.address)
    console.log("Mock Quote Token created: " + quote.address);*/

    /*await base.setDecimals(3)
    await quote.setDecimals(6)
    await base.setSymbol("USDC")
    await quote.setSymbol("WETH")*/

    /*await base.deposit("0xd825D73CDD050ecbEBC0B3a8D9C5952d1F64722e", BIG_QTY, override)
    await quote.deposit("0xd825D73CDD050ecbEBC0B3a8D9C5952d1F64722e", BIG_QTY, override)
    await base.deposit(await lp.getAddress(), BIG_QTY, override)
    await quote.deposit(await lp.getAddress(), BIG_QTY, override)
    await base.deposit(await trader.getAddress(), BIG_QTY, override)
    await quote.deposit(await trader.getAddress(), BIG_QTY, override)
    await base.connect(lp).approve(dex.address, BIG_QTY, override)
    await quote.connect(lp).approve(dex.address, BIG_QTY, override)
    await base.connect(trader).approve(dex.address, BIG_QTY, override)
    await quote.connect(trader).approve(dex.address, BIG_QTY, override)*/

    /*let protoCmd = encodeProtocolCmd(66, ZERO_ADDR, ZERO_ADDR, POOL_IDX, FEE_RATE, 0, 30, 100)
    await dex.protocolCmd(protoCmd, override)*/

    /*protoCmd = encodeProtocolCmd(66, ZERO_ADDR, ZERO_ADDR, POOL_IDX_2, FEE_RATE_2, 0, 5, 100)
    await dex.protocolCmd(protoCmd, override)*/
    //await dex.initPool(base.address, quote.address, POOL_IDX, toSqrtPrice(1.0), override)

    const ropstenDai = "0xad6d458402f60fd3bd25163575031acdce07538d"
    const ropstenWbtc = "0x442be68395613bdcd19778e761f03261ec46c06d"
    const ropstenUsdc = "0x07865c6e87b9f70255377e024ace6630c1eaa37f"

    //await dex.initPool(ZERO_ADDR, ropstenDai, POOL_IDX, toSqrtPrice(6), override)
    /*await dex.initPool(ZERO_ADDR, ropstenWbtc, POOL_IDX, toSqrtPrice(60000000), override)
    await dex.initPool(ZERO_ADDR, ropstenUsdc, POOL_IDX, toSqrtPrice(3e+15), override)
    await dex.initPool(ropstenUsdc, ropstenDai, POOL_IDX, toSqrtPrice(1e-06), override)

    console.log("Pool initialized at Index: " + POOL_IDX)*/

    /*factory = await ethers.getContractFactory("MockERC20")
    let daiErc20 = factory.attach(ropstenDai) as MockERC20
    await daiErc20.approve(dex.address, BigNumber.from(10).pow(30), override)*/

    /*factory = await ethers.getContractFactory("MockERC20")
    let wbtcErc20 = factory.attach(ropstenWbtc) as MockERC20
    await wbtcErc20.approve(dex.address, BigNumber.from(10).pow(30), override)

    factory = await ethers.getContractFactory("MockERC20")
    let usdcErc20 = factory.attach(ropstenUsdc) as MockERC20
    await usdcErc20.approve(dex.address, BigNumber.from(10).pow(30), override)*/

    /*let mintCmd = encodeMintAmbient(ZERO_ADDR, ropstenDai, BigNumber.from(10).pow(18), false)
    await dex.connect(lp).tradeWarm(mintCmd, Object.assign({value: BigNumber.from(10).pow(17)}, override))*/

    /*let burnCmd = encodeBurnAmbient(ZERO_ADDR, ropstenWbtc, BigNumber.from(10).pow(4), false)
    await dex.connect(lp).tradeWarm(burnCmd, Object.assign({value: BigNumber.from(10).pow(17)}, override))*/

    /*let mintCmd = encodeMintAmbient(ropstenUsdc, ropstenDai, BigNumber.from(10).pow(12), false)
    await dex.connect(lp).tradeWarm(mintCmd, override)*/

    /*await dex.swap(ZERO_ADDR, ropstenWbtc, POOL_IDX, true, true, BigNumber.from(10).pow(6), toSqrtPrice(1.8e11), false, 
        Object.assign({value: BigNumber.from(10).pow(14)}, override))*/

    /*await dex.swap(ZERO_ADDR, ropstenUsdc, POOL_IDX, false, false, BigNumber.from(10).pow(6), toSqrtPrice(1.866667e-09), false, 
        Object.assign({value: BigNumber.from(10).pow(14)}, override))*/

    /*await dex.swap(ZERO_ADDR, ropstenUsdc, POOL_IDX, false, true, BigNumber.from(10).pow(6), toSqrtPrice(3e9), false, 
        Object.assign({value: BigNumber.from(10).pow(14)}, override))*/

    /*await dex.swap(ropstenUsdc, ropstenDai, POOL_IDX, false, true, BigNumber.from(10).pow(6), toSqrtPrice(1e-12), false, 
        Object.assign({value: BigNumber.from(10).pow(14)}, override))*/

    factory = await ethers.getContractFactory("QueryHelper")
    //let query = await factory.deploy(dex.address, override) as QueryHelper
    let query = factory.attach("0x3F6B274529dDe713CF7703129f219e38dC0D83b5") as QueryHelper
    console.log("Query Sidecar at " + query.address)

    await describeCurve(query, ZERO_ADDR, ropstenDai)
    await describeCurve(query, ZERO_ADDR, ropstenWbtc)
    await describeCurve(query, ZERO_ADDR, ropstenUsdc)
    await describeCurve(query, ropstenUsdc, ropstenDai)

    /*let swapTx = await dex.connect(trader)
        .swap(ZERO_ADDR, ropstenDai, POOL_IDX, true, true, BigNumber.from(10).pow(10), MAX_PRICE, false,
                Object.assign({value: BigNumber.from(10).pow(15)}, override))*/
    
    /*let swapTx = await dex.connect(trader)
        .swap(ZERO_ADDR, ropstenDai, POOL_IDX, false, false, BigNumber.from(10).pow(15), MIN_PRICE, false,
                override)*/

    /*liq = await query.queryLiquidity(ZERO_ADDR, ropstenDai, POOL_IDX)
    curve = await query.queryCurve(ZERO_ADDR, ropstenDai, POOL_IDX)
    price = fromSqrtPrice(curve.priceRoot_)
    console.log("Swap Tx: " + swapTx.hash)
    console.log("Liquidity " + liq.toString() + " at price " + price.toString())*/
}

deploy()